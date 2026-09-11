/**
 * PROMPT COMPILATION -> GENERATION -> QUALITY EVALUATION -> OPTIONAL RETRY -> STITCHING -> EXPORT
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { Assets, Attempts, Costs, Events, Exports, Frames, Generations, Opportunities, PairAnalyses, Projects, Quality, Users, VisualAnalyses } from "@/db/repo";
import { CREDITS_PER_GENERATION } from "@/lib/server/billing";
import { normalizeBridge, poster, probe, stitch, trimClip, type FrameSpec } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import { getRecipe } from "@/core/recipes/registry";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { proceduralAllowed, routeModels } from "@/core/providers/router";
import { ProviderError } from "@/core/providers/types";
import { isBillingError, markProviderUnavailable } from "@/core/providers/cooldown";
import { budgetExhausted } from "./budget";
import { getProvider } from "@/core/providers/registry";
import { LOCAL_MODEL } from "@/core/providers/local";
import type { ModelSpec, TransitionRequest } from "@/core/providers/types";
import { judgeTransition, passes } from "@/core/quality/judge";
import { selectPassingCandidate } from "@/core/quality/selection";
import { planNextAttempt, saferRecipeFor, type AttemptOutcome } from "@/core/quality/retry-policy";
import { recordGeneration, learnedModelQuality } from "@/core/learning/records";
import type { ExtractedFrame, FineTune, FrameAnalysis, Generation, GenerationAttempt, Job, QualityScores } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { Reporter } from "./runner";
import { labelFor } from "./stages";
import { specForProject } from "./analyze-job";

const log = logger("generate");

/** A procedural dissolve is safe, not great: cap it so a real bridge that clears the bar is always preferred. */
function capProcedural(scores: QualityScores, providerId: string) {
  if (providerId === "local") scores.overall = Math.min(scores.overall, 80);
}

const FRIENDLY_FAIL = "We couldn't build that transition from these clips. Try another style, or a different cut point.";
const FRIENDLY_BUSY = "SeamCut has reached today's AI limit. Your credits are untouched; try again later.";
const FRIENDLY_NO_MODEL = "No AI bridge model is available right now. Your credits are untouched; try again shortly.";

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

export async function runGenerateJob(job: Job, report: Reporter) {
  const generationId = String(job.payload.generationId);
  const gen = Generations.get(generationId);
  if (!gen) throw new Error("generation not found");
  const project = Projects.get(gen.projectId)!;
  const setStage = (stage: string, progress: number, label?: string) => {
    report(stage, progress, label);
    Generations.update(gen.id, { status: "running", stage, stageLabel: label ?? labelFor(stage), progress });
  };
  const t0 = Date.now();

  try {
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

    let recipe = getRecipe(gen.recipeId);
    let fineTune = gen.fineTune;
    let exclude: string[] = [];
    const outcomes: AttemptOutcome[] = [];
    const attempts: GenerationAttempt[] = [];
    let best: Best | null = null;
    let suggestion: string | null = null;
    let fellBackToLocal = false;
    const maxAttempts = Math.max(1, config.generation.maxAttempts);

    type RunOutcome = { attempt: GenerationAttempt; model: ModelSpec; ok: boolean; scores: QualityScores | null; bridgePath: string | null; error: string | null; recipeId: string; durationSec: number };
    // One provider attempt: create the row, generate, normalise, judge, book costs. Safe to run several concurrently.
    const runOne = async (model: ModelSpec, n: number, rec: TransitionRecipe, ft: FineTune): Promise<RunOutcome> => {
      const durationSec = durationFor(rec, ft);
      const ir = compileIR({ a: analysisA, b: analysisB, pair: pairRow.data, recipe: rec, hints: opp.hints, fineTune: ft, durationSec, aspectRatio: aspect, attempt: n });
      const provider = getProvider(model.providerId);
      const prompt = renderPrompt(ir, model.dialect);
      const rawPath = path.join(dir, `attempt_${n}_raw.mp4`);
      const attempt = Attempts.create({
        generationId: gen.id, n, recipeId: rec.id, providerId: model.providerId, modelId: model.id, promptIR: ir, compiledPrompt: prompt,
        params: { durationSec, fineTune: ft, mode: gen.mode }, status: "running", providerJobId: null, outputPath: null, error: null, costUsd: 0, durationMs: 0,
      });
      attempts.push(attempt);
      setStage(n > 1 ? "retry" : "generate", 0.15 + (n - 1) * 0.2, n > 1 ? labelFor("retry") : `${labelFor("generate")} · ${model.label}`);
      log.info("attempt", { gen: gen.id, n, recipe: rec.id, model: model.id, durationSec });
      const ta = Date.now();
      try {
        const result = await provider.generateTransition({
          firstFramePath: frameA.path, lastFramePath: frameB.path, prompt, durationSec, aspectRatio: aspect, outputPath: rawPath,
          transitionType: rec.id, motionStrength: ir.motionStrength,
          local: { spec, recipe: rec, focusA: focusPoint(analysisA, frameA, rec, opp.hints.shapeA), focusB: focusPoint(analysisB, frameB, rec, opp.hints.shapeB) },
          onProgress: (m) => setStage(n > 1 ? "retry" : "generate", 0.25 + (n - 1) * 0.2, m),
        }, model);
        const bridgePath = path.join(dir, `attempt_${n}_bridge.mp4`);
        await normalizeBridge(result.outputPath, bridgePath, spec, durationSec);
        setStage("judge", 0.55 + (n - 1) * 0.1);
        const judged = await judgeTransition({ bridgePath, sourceFrame: frameA.path, destFrame: frameB.path, recipe: rec, prompt: prompt.positive, tmpDir: dir, cheap: model.providerId === "local" });
        capProcedural(judged.scores, model.providerId);
        const ok = passes(judged.scores, gen.mode);
        Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: ok });
        const cost = result.costUsd + judged.costUsd;
        if (result.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "generation", providerId: model.providerId, modelId: model.id, units: result.rawDurationSec, usd: result.costUsd });
        if (judged.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "judge", providerId: "openai", modelId: config.openai.judgeModel, units: 1, usd: judged.costUsd });
        Attempts.update(attempt.id, { status: ok ? "succeeded" : "rejected", providerJobId: result.providerJobId, outputPath: bridgePath, costUsd: cost, durationMs: Date.now() - ta, params: { ...attempt.params, ...result.params } });
        attempt.recipeId = rec.id; attempt.durationMs = Date.now() - ta; attempt.status = ok ? "succeeded" : "rejected";
        return { attempt, model, ok, scores: judged.scores, bridgePath, error: null, recipeId: rec.id, durationSec };
      } catch (e) {
        const msg = (e as Error).message;
        log.warn("attempt failed", { gen: gen.id, n, error: msg });
        if (e instanceof ProviderError && !e.retryable && isBillingError(e.message)) { markProviderUnavailable(e.providerId); log.warn("provider parked", { provider: e.providerId, reason: "billing" }); }
        Attempts.update(attempt.id, { status: "failed", error: msg, durationMs: Date.now() - ta });
        attempt.status = "failed"; attempt.durationMs = Date.now() - ta;
        return { attempt, model, ok: false, scores: null, bridgePath: null, error: msg, recipeId: rec.id, durationSec };
      }
    };

    let attemptNo = 0;
    while (attemptNo < maxAttempts) {
      const learned = learnedModelQuality([recipe.id]);
      const overBudget = budgetExhausted();
      if (overBudget && !proceduralAllowed()) throw new GenerationStopped(FRIENDLY_BUSY, "daily provider budget reached");
      if (overBudget && attemptNo === 0) log.warn("daily provider budget reached; using the procedural bridge", { gen: gen.id });
      const ranked = overBudget ? [LOCAL_MODEL] : routeModels({ recipe, mode: gen.mode, exclude, learned });
      const fanOut = attemptNo === 0 ? Math.max(1, config.generation.parallelAttempts) : 1;
      const remote = ranked.filter((m) => m.providerId !== "local");
      const round: ModelSpec[] = fanOut > 1 && remote.length >= 2 ? remote.slice(0, Math.min(fanOut, maxAttempts)) : ranked.slice(0, 1);
      if (!round.length) throw new GenerationStopped(FRIENDLY_NO_MODEL, "no bridge model available for this recipe");
      const results = await Promise.all(round.map((m, i) => runOne(m, attemptNo + i + 1, recipe, fineTune)));
      attemptNo += round.length;
      let passed = false;
      for (const r of results) {
        if (r.scores && r.bridgePath) best = selectPassingCandidate(best, { attempt: r.attempt, bridgePath: r.bridgePath, scores: r.scores, model: r.model, recipe: getRecipe(r.recipeId), durationSec: r.durationSec }, gen.mode);
        if (r.model.providerId === "local" && attemptNo > 1) fellBackToLocal = true;
        if (r.ok) { passed = true; continue; }
        // A rejected or failed model gets one shot per generation; later rounds go to the next-best bridge model.
        exclude = [...new Set([...exclude, r.model.id])];
        if (r.scores) {
          log.warn("quality rejected", { gen: gen.id, n: r.attempt.n, overall: r.scores.overall, issues: r.scores.issues });
          outcomes.push({ kind: "quality", message: r.scores.issues.join("; "), scores: r.scores, modelId: r.model.id });
        } else {
          outcomes.push({ kind: "error", message: r.error ?? "failed", scores: null, modelId: r.model.id });
        }
      }
      if (passed) break;
      const next = planNextAttempt({ attempt: attemptNo, maxAttempts, recipe, fineTune, outcomes, opportunities: opps });
      if (!next) break;
      setStage("retry", 0.2 + attemptNo * 0.15, next.userMessage);
      recipe = getRecipe(next.recipeId);
      fineTune = next.fineTune;
      exclude = [...new Set([...exclude, ...next.excludeModels])];
      if (next.suggestion) suggestion = next.suggestion;
    }

    // If every candidate failed, try a procedural bridge with the safest recipe. Offline and CI only.
    if (!best && proceduralAllowed()) {
      const safe = saferRecipeFor(recipe, opps);
      const durationSec = durationFor(safe, fineTune);
      const ir = compileIR({ a: analysisA, b: analysisB, pair: pairRow.data, recipe: safe, hints: opp.hints, fineTune, durationSec, aspectRatio: aspect, attempt: maxAttempts + 1 });
      const prompt = renderPrompt(ir, "generic");
      const attempt = Attempts.create({
        generationId: gen.id, n: attempts.length + 1, recipeId: safe.id, providerId: "local", modelId: LOCAL_MODEL.id, promptIR: ir, compiledPrompt: prompt,
        params: { durationSec, fallback: true }, status: "running", providerJobId: null, outputPath: null, error: null, costUsd: 0, durationMs: 0,
      });
      attempts.push(attempt);
      setStage("retry", 0.7, "Using a cleaner, simpler move instead");
      const ta = Date.now();
      const rawPath = path.join(dir, `fallback_raw.mp4`);
      const result = await getProvider("local").generateTransition({
        firstFramePath: frameA.path, lastFramePath: frameB.path, prompt, durationSec, aspectRatio: aspect, outputPath: rawPath, transitionType: safe.id,
        motionStrength: ir.motionStrength, local: { spec, recipe: safe, focusA: focusPoint(analysisA, frameA, safe, opp.hints.shapeA), focusB: focusPoint(analysisB, frameB, safe, opp.hints.shapeB) },
      }, LOCAL_MODEL);
      const bridgePath = path.join(dir, `fallback_bridge.mp4`);
      await normalizeBridge(result.outputPath, bridgePath, spec, durationSec);
      const judged = await judgeTransition({ bridgePath, sourceFrame: frameA.path, destFrame: frameB.path, recipe: safe, prompt: prompt.positive, tmpDir: dir, cheap: true });
      capProcedural(judged.scores, "local");
      const ok = passes(judged.scores, gen.mode);
      Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: ok });
      Attempts.update(attempt.id, { status: ok ? "succeeded" : "rejected", outputPath: bridgePath, durationMs: Date.now() - ta });
      attempt.durationMs = Date.now() - ta; attempt.status = ok ? "succeeded" : "rejected";
      best = selectPassingCandidate(best, { attempt, bridgePath, scores: judged.scores, model: LOCAL_MODEL, recipe: safe, durationSec }, gen.mode);
      if (!best) throw new Error("The fallback transition failed the quality checks");
      fellBackToLocal = true;
      suggestion = suggestion ?? `This footage is fighting the ${getRecipe(gen.recipeId).name.toLowerCase()}. A ${safe.name.toLowerCase()} will likely look cleaner.`;
    }

    // AI transitions only: a bridge that never passed is a refunded failure, not a crossfade dressed up as a result.
    if (!best) throw new GenerationStopped(FRIENDLY_FAIL, "every AI bridge attempt failed or was rejected");

    // ---- stitch: A[..cutA] + bridge + B[cutB..]
    setStage("stitch", 0.8);
    const fps = spec.fps;
    const durA = assetA.durationSec ?? (await probe(assetA.proxyPath!)).durationSec;
    const durB = assetB.durationSec ?? (await probe(assetB.proxyPath!)).durationSec;
    const cutA = Math.min(durA, Math.max(0.35, frameA.t + 1 / fps));
    const cutB = Math.max(0, Math.min(durB - 0.35, frameB.t + 1 / fps));
    const partA = path.join(dir, "part_a.mp4"), partB = path.join(dir, "part_b.mp4");
    await trimClip(assetA.proxyPath!, partA, null, cutA, spec);
    await trimClip(assetB.proxyPath!, partB, cutB, null, spec);
    const fullPath = path.join(dir, "full.mp4");
    await stitch(partA, best.bridgePath, partB, fullPath, spec, config.output.seamCrossfadeSec);
    setStage("export", 0.95);
    const posterPath = path.join(dir, "poster.jpg");
    await poster(fullPath, posterPath, Math.max(0, cutA - 0.05));
    const finalBridge = path.join(dir, "transition.mp4");
    fs.copyFileSync(best.bridgePath, finalBridge);
    const full = await probe(fullPath);
    Exports.create({ generationId: gen.id, kind: "full", path: fullPath });
    Exports.create({ generationId: gen.id, kind: "bridge", path: finalBridge });

    const result: Generation["result"] = {
      bridgePath: finalBridge, fullPath, posterPath, bridgeDurationSec: best.durationSec, fullDurationSec: full.durationSec,
      cutA: frameA.t, cutB: frameB.t, providerId: best.model.providerId, modelId: best.model.id, quality: best.scores, attempts: attempts.length,
      fellBackToLocal, suggestion,
    };
    Generations.update(gen.id, { status: "ready", stage: "ready", stageLabel: labelFor("ready"), progress: 1, result, recipeId: best.recipe.id, friendlyError: null });
    recordGeneration({ generation: { ...gen, recipeId: best.recipe.id }, a: analysisA, b: analysisB, attempts, quality: best.scores, promptVersion: best.attempt.promptIR.version, durationSec: best.durationSec });
    Events.track("generation_succeeded", { userId: project.userId, projectId: gen.projectId, generationId: gen.id, props: { ms: Date.now() - t0, recipe: best.recipe.id, model: best.model.id, attempts: attempts.length, quality: best.scores.overall, fellBackToLocal } });
    log.info("generation ready", { gen: gen.id, ms: Date.now() - t0, recipe: best.recipe.id, model: best.model.id, quality: best.scores.overall });
  } catch (e) {
    const msg = (e as Error).message;
    Users.grant(project.userId, CREDITS_PER_GENERATION[gen.mode]); // never charge for a failure
    Generations.update(gen.id, { status: "failed", stage: "failed", stageLabel: labelFor("failed"), friendlyError: e instanceof GenerationStopped ? e.friendly : FRIENDLY_FAIL });
    Events.track("generation_failed", { userId: project.userId, projectId: gen.projectId, generationId: gen.id, props: { error: msg } });
    throw e;
  }
}
