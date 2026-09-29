/**
 * PROMPT COMPILATION -> GENERATION -> QUALITY EVALUATION -> OPTIONAL RETRY -> STITCHING -> EXPORT
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { Assets, Attempts, Costs, Events, Exports, Frames, Generations, Opportunities, PairAnalyses, Projects, Purchases, FreeRuns, Quality, Users, VisualAnalyses } from "@/db/repo";
import { CREDITS_PER_GENERATION } from "@/lib/server/billing";
import { normalizeBridge, poster, probe, stitch, trimClip, type FrameSpec } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import { getRecipe } from "@/core/recipes/registry";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { expectedProfile, proceduralAllowed, routeModels } from "@/core/providers/router";
import { writeShot } from "@/core/prompt/director";
import { openaiErrorSummary, openaiOutOfCredit } from "@/core/openai";
import { ProviderQueueSkip, ProviderError, ProviderOutcomeUnknownError } from "@/core/providers/types";
import { isBillingError, markProviderUnavailable } from "@/core/providers/cooldown";
import { styleStaging } from "@/core/recipes/style-contract";
import { budgetExhausted } from "./budget";
import { firstPassing } from "./race";
import { Attempts as AttemptRows } from "@/db/repo";
import { getProvider } from "@/core/providers/registry";
import { LOCAL_MODEL } from "@/core/providers/local";
import type { ModelSpec, TransitionRequest } from "@/core/providers/types";
import { judgeTransition, passes } from "@/core/quality/judge";
import { passesStyle } from "@/core/quality/style";
import { transitionSmoothness } from "@/core/quality/smoothness";
import { selectPassingCandidate } from "@/core/quality/selection";
import { planNextAttempt, type AttemptOutcome } from "@/core/quality/retry-policy";
import { recordGeneration, learnedModelQuality } from "@/core/learning/records";
import type { ExtractedFrame, FineTune, FrameAnalysis, Generation, GenerationAttempt, Job, PromptIR, QualityScores } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { Reporter } from "./runner";
import { labelFor } from "./stages";
import { specForProject } from "./analyze-job";

const log = logger("generate");

/** A procedural dissolve is safe, not great: cap it so a real bridge that clears the bar is always preferred. */
function capProcedural(scores: QualityScores, providerId: string) {
  if (providerId === "local") scores.overall = Math.min(scores.overall, 80);
}

/**
 * A second first-round model only pays for itself when the first is slow. MiniMax H3 Max answers in about 15 s, so racing
 * Wan behind it would book $0.25 a preview for a result that is almost never used.
 */
const FAN_OUT_MIN_WAIT_SEC = 60;

const FRIENDLY_FAIL = "We couldn't build that transition from these clips. Try another style, or a different cut point.";
const FRIENDLY_BUSY = "Clipmelt has reached today's AI limit. Your credits are untouched; try again later.";
const FRIENDLY_NO_JUDGE = "Our quality check is briefly unavailable, so nothing was delivered. Your credits are untouched; try again in a few minutes.";
const FRIENDLY_NO_MODEL = "No AI bridge model is available right now. Your credits are untouched; try again shortly.";
const FRIENDLY_UNKNOWN = "We couldn't confirm the video provider's result, so we stopped without starting another render. Your credits have been returned.";

/** A stop we can explain: the generation's friendlyError comes from `friendly`, never from the raw error. */
class GenerationStopped extends Error {
  constructor(readonly friendly: string, message: string) {
    super(message);
  }
}

function aspectFor(spec: FrameSpec): TransitionRequest["aspectRatio"] {
  const r = spec.width / spec.height;
  return r > 1.2 ? "16:9" : r < 0.8 ? "9:16" : "1:1";
}

function durationFor(recipe: TransitionRecipe, ft: FineTune): number {
  const [lo, hi] = recipe.recommendedDuration;
  return Math.round((lo + (hi - lo) * ft.duration) * 100) / 100;
}

function focusPoint(analysis: FrameAnalysis, frame: ExtractedFrame, recipe: TransitionRecipe, hint: string | undefined): { x: number; y: number } {
  if (recipe.local.target === "center") return { x: 0.5, y: 0.5 };
  if (recipe.local.target === "shape") {
    const shape = analysis.geometry.shapes.find((s) => hint && s.label.toLowerCase() === hint.toLowerCase()) ?? analysis.geometry.shapes[0];
    if (shape) return shape.center;
    const subj = [...analysis.subjects].sort((a, b) => b.prominence - a.prominence)[0];
    if (subj) return subj.center;
  }
  const c = analysis.composition.centerOfInterest;
  if (c && (c.x !== 0.5 || c.y !== 0.5)) return c;
  return frame.features.focus;
}

interface Best { attempt: GenerationAttempt; bridgePath: string; scores: QualityScores; model: ModelSpec; recipe: TransitionRecipe; durationSec: number }

/** `judge` is replaceable so tests can drive the pipeline without a model judge. */
export async function runGenerateJob(job: Job, report: Reporter, judge = judgeTransition) {
  const generationId = String(job.payload.generationId);
  const gen = Generations.get(generationId);
  if (!gen) throw new Error("generation not found");
  // A requeued runner must not render or refund a generation that already finished.
  if (gen.status === "ready") return;
  if (gen.status === "failed") throw new Error("generation already failed");
  const project = Projects.get(gen.projectId)!;
  const setStage = (stage: string, progress: number, label?: string) => {
    report(stage, progress, label);
    Generations.update(gen.id, { status: "running", stage, stageLabel: label ?? labelFor(stage), progress });
  };
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  let sourcePreparation: Promise<{ error: unknown } | null> | undefined;

  try {
    const interrupted = Attempts.forGeneration(gen.id).find((a) => a.providerId === "higgsfield" && (
      ["submitting", "submitted", "unknown", "completed"].includes(String(a.params.providerRequestState)) ||
      a.status === "running" || a.error === "interrupted by a restart"
    ));
    if (interrupted) {
      throw new GenerationStopped(FRIENDLY_UNKNOWN, `previous Higgsfield attempt must be reconciled before resubmitting: ${interrupted.providerJobId ?? interrupted.id}`);
    }
    setStage("compile", 0.05);
    const opp = Opportunities.get(gen.opportunityId);
    const pairRow = opp ? PairAnalyses.get(opp.pairAnalysisId) : PairAnalyses.latestForProject(gen.projectId);
    if (!opp || !pairRow) throw new Error("analysis missing; re-run analysis");
    const frameA = Frames.get(pairRow.startFrameId)!, frameB = Frames.get(pairRow.endFrameId)!;
    const analysisA = VisualAnalyses.forFrame(frameA.id)?.data, analysisB = VisualAnalyses.forFrame(frameB.id)?.data;
    if (!analysisA || !analysisB) throw new Error("frame analysis missing");
    const assetA = Assets.get(frameA.assetId)!, assetB = Assets.get(frameB.assetId)!;
    const spec = specForProject(project);
    const aspect = aspectFor(spec);
    const opps = Opportunities.forProject(gen.projectId);
    const dir = storage.ensureDir(storage.renderDir(gen.id));

    // These trims depend only on the chosen boundary frames, not on the generated bridge. Prepare them during
    // the director/provider network wait. Keep local encodes sequential on the small production instance.
    const fps = spec.fps;
    const durA = assetA.durationSec ?? (await probe(assetA.proxyPath!)).durationSec;
    const durB = assetB.durationSec ?? (await probe(assetB.proxyPath!)).durationSec;
    const cutA = Math.min(durA, Math.max(0.35, frameA.t + 1 / fps));
    const cutB = Math.max(0, Math.min(durB - 0.35, frameB.t + 1 / fps));
    const partA = path.join(dir, "part_a.mp4"), partB = path.join(dir, "part_b.mp4");
    const preparationStart = Date.now();
    sourcePreparation = (async () => {
      await trimClip(assetA.proxyPath!, partA, null, cutA, spec);
      await trimClip(assetB.proxyPath!, partB, cutB, null, spec);
      timings.prepareSourcesMs = Date.now() - preparationStart;
    })().then(() => null, (error: unknown) => ({ error }));

    let recipe = getRecipe(gen.recipeId);
    let fineTune = gen.fineTune;
    let exclude: string[] = [];
    const outcomes: AttemptOutcome[] = [];
    const attempts: GenerationAttempt[] = [];
    let best: Best | null = null;
    let suggestion: string | null = null;
    let fellBackToLocal = false;
    const maxAttempts = Math.max(1, config.generation.maxAttempts);

    // One written shot per recipe, shared by concurrent attempts. Without OpenAI, or when the call fails, the template stands.
    const shots = new Map<string, Promise<string | null>>();
    const shotFor = (rec: TransitionRecipe, ir: PromptIR): Promise<string | null> => {
      if (!config.openai.enabled) return Promise.resolve(null);
      let shot = shots.get(rec.id);
      if (!shot) {
        const styleMiss = outcomes.findLast((o) => o.scores && !passesStyle(o.scores));
        shot = writeShot({ sourceFrame: frameA.path, destFrame: frameB.path, transition: ir.transition, staging: styleStaging(rec), styleRequirement: ir.styleRequirement, retryFeedback: styleMiss?.scores?.styleEvidence || styleMiss?.message, expectedStructure: rec.expectedStructure, pair: pairRow.data })
          .then((r) => {
            if (r.costUsd > 0) Costs.add({ attemptId: null, generationId: gen.id, kind: "analysis", providerId: "openai", modelId: config.openai.directorModel, units: 1, usd: r.costUsd });
            return r.shot;
          })
          .catch((e) => { log.warn("director failed; using the recipe template", { gen: gen.id, error: openaiErrorSummary(e) }); return null; });
        shots.set(rec.id, shot);
      }
      return shot;
    };

    type RunOutcome = { attempt: GenerationAttempt; model: ModelSpec; ok: boolean; scores: QualityScores | null; bridgePath: string | null; error: string | null; recipeId: string; durationSec: number; unjudged?: boolean; outcomeUnknown?: boolean; skipped?: boolean };
    // One provider attempt: create the row, generate, normalise, judge, book costs. Safe to run several concurrently.
    // `live` turns false when the attempt's round is over. A fan-out sibling still rendering after that must not write
    // the generation's stage: the generation has moved on to stitching, ready or failed, and setStage would put it
    // back to "running" (a ready preview reverted to "Checking the result" and its share link 404ed, 2026-09-16).
    const runOne = async (model: ModelSpec, n: number, rec: TransitionRecipe, ft: FineTune, live: { current: boolean }): Promise<RunOutcome> => {
      const attemptTimings: Record<string, number> = {};
      const stage = (s: string, progress: number, label?: string) => { if (live.current) setStage(s, progress, label); };
      const durationSec = durationFor(rec, ft);
      const ir = compileIR({ a: analysisA, b: analysisB, pair: pairRow.data, recipe: rec, hints: opp.hints, fineTune: ft, durationSec, aspectRatio: aspect, attempt: n });
      if (model.providerId !== "local") {
        const directorStart = Date.now();
        const shot = await shotFor(rec, ir);
        attemptTimings.directorMs = Date.now() - directorStart;
        if (shot) ir.shot = shot;
      }
      const provider = getProvider(model.providerId);
      const prompt = renderPrompt(ir, model.dialect);
      const noJudge = model.providerId !== "local" && config.openai.enabled && openaiOutOfCredit();
      const rawPath = path.join(dir, `attempt_${n}_raw.mp4`);
      const attempt = Attempts.create({
        generationId: gen.id, n, recipeId: rec.id, providerId: model.providerId, modelId: model.id, promptIR: ir, compiledPrompt: prompt,
        params: { durationSec, fineTune: ft, mode: gen.mode }, status: "running", providerJobId: null, outputPath: null, error: null, costUsd: 0, durationMs: 0,
      });
      attempts.push(attempt);
      stage(n > 1 ? "retry" : "generate", 0.15 + (n - 1) * 0.2, n > 1 ? labelFor("retry") : `${labelFor("generate")} · ${model.label}`);
      log.info("attempt", { gen: gen.id, n, recipe: rec.id, model: model.id, durationSec });
      const ta = Date.now();
      try {
        if (noJudge) throw new Error("OpenAI account is out of credit: no judge can check a render, so none was paid for");
        const result = await provider.generateTransition({
          firstFramePath: frameA.path, lastFramePath: frameB.path, prompt, durationSec, aspectRatio: aspect, outputPath: rawPath,
          transitionType: rec.id, motionStrength: ir.motionStrength,
          local: { spec, recipe: rec, focusA: focusPoint(analysisA, frameA, rec, opp.hints.shapeA), focusB: focusPoint(analysisB, frameB, rec, opp.hints.shapeB) },
          onProgress: (m) => stage(n > 1 ? "retry" : "generate", 0.25 + (n - 1) * 0.2, m),
          onSubmission: (receipt) => {
            attempt.params = { ...attempt.params, providerRequestState: receipt.state, correlationId: receipt.correlationId ?? null };
            attempt.providerJobId = receipt.requestId ?? null;
            Attempts.update(attempt.id, { params: attempt.params, providerJobId: attempt.providerJobId });
          },
        }, model);
        if (model.providerId === "higgsfield") {
          attempt.params = { ...attempt.params, providerRequestState: "completed" };
          Attempts.update(attempt.id, { params: attempt.params, providerJobId: result.providerJobId });
        }
        attemptTimings.providerMs = Date.now() - ta;
        const bridgePath = path.join(dir, `attempt_${n}_bridge.mp4`);
        const normalizeStart = Date.now();
        const bridgeSec = await normalizeBridge(result.outputPath, bridgePath, spec, durationSec, config.output.maxBridgeSpeedup);
        attemptTimings.normalizeMs = Date.now() - normalizeStart;
        stage("judge", 0.55 + (n - 1) * 0.1);
        const judgeStart = Date.now();
        const judged = await judge({ bridgePath, sourceFrame: frameA.path, destFrame: frameB.path, recipe: rec, prompt: prompt.positive, tmpDir: path.join(dir, `judge_${n}`), cheap: model.providerId === "local" });
        attemptTimings.judgeMs = Date.now() - judgeStart;
        capProcedural(judged.scores, model.providerId);
        const ok = passes(judged.scores, gen.mode);
        Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: ok });
        const cost = result.costUsd + judged.costUsd;
        if (result.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "generation", providerId: model.providerId, modelId: model.id, units: result.rawDurationSec, usd: result.costUsd });
        if (judged.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "judge", providerId: "openai", modelId: config.openai.judgeModel, units: 1, usd: judged.costUsd });
        Attempts.update(attempt.id, { status: ok ? "succeeded" : "rejected", providerJobId: result.providerJobId, outputPath: bridgePath, costUsd: cost, durationMs: Date.now() - ta, params: { ...attempt.params, ...result.params, bridgeSec, timings: attemptTimings } });
        log.info("attempt timings", { gen: gen.id, n, model: model.id, ...attemptTimings });
        attempt.recipeId = rec.id; attempt.durationMs = Date.now() - ta; attempt.status = ok ? "succeeded" : "rejected";
        return { attempt, model, ok, scores: judged.scores, bridgePath, error: null, recipeId: rec.id, durationSec: bridgeSec, unjudged: judged.judge === "unavailable" };
      } catch (e) {
        const msg = (e as Error).message;
        log.warn("attempt failed", { gen: gen.id, n, error: msg });
        // An unfunded wallet will not refill in minutes: park the provider for an hour, and (like a skipped queue) don't
        // let a render that never happened use up one of the generation's attempts.
        const billing = e instanceof ProviderError && !e.retryable && isBillingError(e.message);
        if (billing) { markProviderUnavailable(e.providerId, 60 * 60_000); log.warn("provider parked", { provider: e.providerId, reason: "billing" }); }
        const outcomeUnknown = e instanceof ProviderOutcomeUnknownError;
        if (model.providerId === "higgsfield") {
          attempt.params = { ...attempt.params, providerRequestState: outcomeUnknown ? "unknown" : attempt.params.providerRequestState === "completed" ? "completed" : "failed" };
          if (e instanceof ProviderOutcomeUnknownError) {
            attempt.providerJobId = e.requestId ?? attempt.providerJobId;
            attempt.params.correlationId = e.correlationId ?? attempt.params.correlationId;
          }
        }
        Attempts.update(attempt.id, { status: "failed", error: msg, durationMs: Date.now() - ta, params: attempt.params, providerJobId: attempt.providerJobId });
        attempt.status = "failed"; attempt.durationMs = Date.now() - ta;
        return { attempt, model, ok: false, scores: null, bridgePath: null, error: msg, recipeId: rec.id, durationSec, outcomeUnknown, skipped: e instanceof ProviderQueueSkip || billing, unjudged: noJudge };
      }
    };

    let attemptNo = 0;
    let attemptSeq = 0; // attempt row numbers; a skipped queue does not use up one of maxAttempts
    let switchedRecipe = false;
    const paidCustomer = Purchases.forUser(project.userId).length > 0;
    while (attemptNo < maxAttempts) {
      const learned = learnedModelQuality([recipe.id]);
      const measured = AttemptRows.modelStats();
      const overBudget = budgetExhausted(paidCustomer);
      if (overBudget && !proceduralAllowed()) throw new GenerationStopped(FRIENDLY_BUSY, "daily provider budget reached");
      if (overBudget && attemptNo === 0) log.warn("daily provider budget reached; using the procedural bridge", { gen: gen.id });
      // The last attempt on a pair the cheap models could not bridge goes to the strongest model for the class, whatever
      // its tier or price: a run that ends with nothing is worse than a dearer take that works.
      // A switch to a safer recipe gets the usual routing; escalating to the priciest model is for the chosen recipe.
      const lastChance = !switchedRecipe && attemptNo > 0 && attemptNo + 1 >= maxAttempts;
      const ranked = overBudget ? [LOCAL_MODEL] : routeModels({ recipe, mode: gen.mode, exclude, learned, best: lastChance, measured });
      const remote = ranked.filter((m) => m.providerId !== "local");
      const leadIsQuick = remote.length > 0 && expectedProfile(remote[0], measured[remote[0].id]).expectedWaitSec <= FAN_OUT_MIN_WAIT_SEC;
      const fanOut = attemptNo === 0 && !leadIsQuick ? Math.max(1, config.generation.parallelAttempts) : 1;
      const round: ModelSpec[] = fanOut > 1 && remote.length >= 2 ? remote.slice(0, Math.min(fanOut, maxAttempts)) : ranked.slice(0, 1);
      if (!round.length) throw new GenerationStopped(FRIENDLY_NO_MODEL, "no bridge model available for this recipe");
      // The round ends as soon as one model passes; a slower sibling keeps rendering and is logged when it lands.
      const live = { current: true };
      const { done: results, pending } = await firstPassing(round.map((m, i) => runOne(m, attemptSeq + i + 1, recipe, fineTune, live)));
      live.current = false;
      for (const late of pending) void late.then((r) => log.info("late attempt finished", { gen: gen.id, n: r.attempt.n, model: r.model.id, status: r.attempt.status }));
      attemptSeq += round.length;
      attemptNo += round.length - results.filter((r) => r.skipped).length;
      let passed = false;
      for (const r of results) {
        if (r.scores && r.bridgePath) best = selectPassingCandidate(best, { attempt: r.attempt, bridgePath: r.bridgePath, scores: r.scores, model: r.model, recipe: getRecipe(r.recipeId), durationSec: r.durationSec }, gen.mode);
        if (r.model.providerId === "local" && attemptNo > 1) fellBackToLocal = true;
        if (r.ok) { passed = true; continue; }
        // A rejected or failed model gets one shot per generation; later rounds go to the next-best bridge model.
        exclude = [...new Set([...exclude, r.model.id])];
        if (r.skipped) continue; // never rendered: not a verdict on the recipe
        if (r.scores) {
          log.warn("quality rejected", { gen: gen.id, n: r.attempt.n, overall: r.scores.overall, issues: r.scores.issues });
          outcomes.push({ kind: "quality", message: r.scores.issues.join("; "), scores: r.scores, modelId: r.model.id });
          if (!passesStyle(r.scores)) shots.delete(recipe.id);
        } else {
          outcomes.push({ kind: "error", message: r.error ?? "failed", scores: null, modelId: r.model.id });
        }
      }
      if (passed) break;
      if (results.some((r) => r.outcomeUnknown)) throw new GenerationStopped(FRIENDLY_UNKNOWN, "provider outcome unknown; automatic generation fallback stopped");
      // Another model would be judged by the same missing judge: stop and refund instead of paying for renders nobody can check.
      if (results.some((r) => r.unjudged)) throw new GenerationStopped(FRIENDLY_NO_JUDGE, "no vision judge answered");
      if (results.length && results.every((r) => r.skipped)) continue; // same plan, next model
      const next = planNextAttempt({ attempt: attemptNo, maxAttempts, recipe, fineTune, outcomes, opportunities: opps });
      if (!next) break;
      setStage("retry", 0.2 + attemptNo * 0.15, next.userMessage);
      if (next.recipeId !== recipe.id) switchedRecipe = true;
      recipe = getRecipe(next.recipeId);
      fineTune = next.fineTune;
      exclude = [...new Set([...exclude, ...next.excludeModels])];
      if (next.suggestion) suggestion = next.suggestion;
    }

    // Offline diagnostics keep the selected recipe too. This is never a substitute style.
    if (!best && proceduralAllowed()) {
      const safe = getRecipe(gen.recipeId);
      const durationSec = durationFor(safe, fineTune);
      const ir = compileIR({ a: analysisA, b: analysisB, pair: pairRow.data, recipe: safe, hints: opp.hints, fineTune, durationSec, aspectRatio: aspect, attempt: maxAttempts + 1 });
      const prompt = renderPrompt(ir, "generic");
      const attempt = Attempts.create({
        generationId: gen.id, n: attempts.length + 1, recipeId: safe.id, providerId: "local", modelId: LOCAL_MODEL.id, promptIR: ir, compiledPrompt: prompt,
        params: { durationSec, fallback: true }, status: "running", providerJobId: null, outputPath: null, error: null, costUsd: 0, durationMs: 0,
      });
      attempts.push(attempt);
      setStage("retry", 0.7, `Preparing a procedural preview of ${safe.name}`);
      const ta = Date.now();
      const rawPath = path.join(dir, `fallback_raw.mp4`);
      const result = await getProvider("local").generateTransition({
        firstFramePath: frameA.path, lastFramePath: frameB.path, prompt, durationSec, aspectRatio: aspect, outputPath: rawPath, transitionType: safe.id,
        motionStrength: ir.motionStrength, local: { spec, recipe: safe, focusA: focusPoint(analysisA, frameA, safe, opp.hints.shapeA), focusB: focusPoint(analysisB, frameB, safe, opp.hints.shapeB) },
      }, LOCAL_MODEL);
      const bridgePath = path.join(dir, `fallback_bridge.mp4`);
      await normalizeBridge(result.outputPath, bridgePath, spec, durationSec);
      const judged = await judge({ bridgePath, sourceFrame: frameA.path, destFrame: frameB.path, recipe: safe, prompt: prompt.positive, tmpDir: dir, cheap: true });
      capProcedural(judged.scores, "local");
      const ok = passes(judged.scores, gen.mode);
      Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: ok });
      Attempts.update(attempt.id, { status: ok ? "succeeded" : "rejected", outputPath: bridgePath, durationMs: Date.now() - ta });
      attempt.durationMs = Date.now() - ta; attempt.status = ok ? "succeeded" : "rejected";
      best = selectPassingCandidate(best, { attempt, bridgePath, scores: judged.scores, model: LOCAL_MODEL, recipe: safe, durationSec }, gen.mode);
      if (!best) throw new Error("The fallback transition failed the quality checks");
      fellBackToLocal = true;
      suggestion = "This is a procedural preview of the selected style, not a verified AI transition.";
    }

    // AI transitions only: a bridge that never passed is a refunded failure, not a crossfade dressed up as a result.
    if (!best) throw new GenerationStopped(FRIENDLY_FAIL, "every AI bridge attempt failed or was rejected");

    // ---- stitch: A[..cutA] + bridge + B[cutB..]
    setStage("stitch", 0.8);
    const preparationWait = Date.now();
    const preparationFailure = await sourcePreparation;
    timings.prepareSourcesWaitMs = Date.now() - preparationWait;
    if (preparationFailure) throw preparationFailure.error;
    const stitchStart = Date.now();
    const fullPath = path.join(dir, "full.mp4");
    await stitch(partA, best.bridgePath, partB, fullPath, spec, config.output.seamCrossfadeSec);
    timings.stitchMs = Date.now() - stitchStart;
    // How noticeable the joins are (1 = invisible, 3+ reads as a cut), logged for every delivered transition.
    let smoothness: { jolt: number; lurch: number } | null = null;
    try {
      const [aInfo, bInfo] = await Promise.all([probe(partA), probe(best.bridgePath)]);
      const measure = (file: string, d: number) => transitionSmoothness(file, spec.fps, [aInfo.durationSec - d / 2, aInfo.durationSec + bInfo.durationSec - 1.5 * d]);
      let m = await measure(fullPath, config.output.seamCrossfadeSec);
      // A join that still jumps (a bridge landing a little off B's first frame, footage moving at the cut): a longer
      // dissolve hides most of it (5.2 -> 3.0 on the paper plane pair, scripts/smoothness-bench.ts). Local, no credits.
      if (m.jolt > 2) {
        const longer = path.join(dir, "full_long_seam.mp4"), d = Math.max(0.5, config.output.seamCrossfadeSec);
        await stitch(partA, best.bridgePath, partB, longer, spec, d);
        const m2 = await measure(longer, d);
        log.info("join repair", { gen: gen.id, before: Number(m.jolt.toFixed(2)), after: Number(m2.jolt.toFixed(2)) });
        if (m2.jolt < m.jolt) { fs.renameSync(longer, fullPath); m = m2; } else fs.rmSync(longer, { force: true });
      }
      smoothness = { jolt: Math.round(m.jolt * 100) / 100, lurch: Math.round(m.lurch * 100) / 100 };
      log.info("join smoothness", { gen: gen.id, ...smoothness, model: best.model.id, recipe: best.recipe.id });
    } catch (e) { log.warn("smoothness measurement failed", { gen: gen.id, error: (e as Error).message }); }
    setStage("export", 0.95);
    const exportStart = Date.now();
    const posterPath = path.join(dir, "poster.jpg");
    await poster(fullPath, posterPath, Math.max(0, cutA - 0.05));
    const finalBridge = path.join(dir, "transition.mp4");
    fs.copyFileSync(best.bridgePath, finalBridge);
    const full = await probe(fullPath);
    Exports.create({ generationId: gen.id, kind: "full", path: fullPath });
    Exports.create({ generationId: gen.id, kind: "bridge", path: finalBridge });
    timings.exportMs = Date.now() - exportStart;

    // Delivered although the selected move didn't show: say what the viewer is looking at.
    if (!suggestion && best.scores.styleMatch && best.scores.styleMatch !== "matched") {
      suggestion = `Not quite ${best.recipe.name}: Clipmelt found its own way between your clips. Try another if you want to go again.`;
    }
    const result: Generation["result"] = {
      bridgePath: finalBridge, fullPath, posterPath, bridgeDurationSec: best.durationSec, fullDurationSec: full.durationSec,
      cutA: frameA.t, cutB: frameB.t, providerId: best.model.providerId, modelId: best.model.id, quality: best.scores, attempts: attempts.length,
      fellBackToLocal, suggestion, smoothness,
    };
    Generations.update(gen.id, { status: "ready", stage: "ready", stageLabel: labelFor("ready"), progress: 1, result, recipeId: best.recipe.id, friendlyError: null });
    recordGeneration({ generation: { ...gen, recipeId: best.recipe.id }, a: analysisA, b: analysisB, attempts, quality: best.scores, promptVersion: best.attempt.promptIR.version, durationSec: best.durationSec });
    Events.track("generation_succeeded", { userId: project.userId, projectId: gen.projectId, generationId: gen.id, props: { ms: Date.now() - t0, timings, recipe: best.recipe.id, model: best.model.id, attempts: attempts.length, quality: best.scores.overall, fellBackToLocal } });
    log.info("generation ready", { gen: gen.id, ms: Date.now() - t0, timings, recipe: best.recipe.id, model: best.model.id, quality: best.scores.overall });
  } catch (e) {
    const msg = (e as Error).message;
    Users.grant(project.userId, CREDITS_PER_GENERATION[gen.mode]); // never charge for a failure
    FreeRuns.release(gen.id); // nor count it against the network's free runs
    Generations.update(gen.id, { status: "failed", stage: "failed", stageLabel: labelFor("failed"), friendlyError: e instanceof GenerationStopped ? e.friendly : FRIENDLY_FAIL });
    Events.track("generation_failed", { userId: project.userId, projectId: gen.projectId, generationId: gen.id, props: { error: msg } });
    throw e;
  } finally {
    // If generation failed first, drain the already-started local work before the runner releases this job's slot.
    await sourcePreparation;
  }
}
