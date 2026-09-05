/**
 * PROMPT COMPILATION -> GENERATION -> QUALITY EVALUATION -> OPTIONAL RETRY -> STITCHING -> EXPORT
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { Assets, Attempts, Costs, Events, Exports, Frames, Generations, Opportunities, PairAnalyses, Projects, Quality, VisualAnalyses } from "@/db/repo";
import { normalizeBridge, poster, probe, stitch, trimClip, type FrameSpec } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import { getRecipe } from "@/core/recipes/registry";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { routeModels } from "@/core/providers/router";
import { getProvider } from "@/core/providers/registry";
import { LOCAL_MODEL } from "@/core/providers/local";
import type { ModelSpec, TransitionRequest } from "@/core/providers/types";
import { judgeTransition, passes } from "@/core/quality/judge";
import { planNextAttempt, saferRecipeFor, type AttemptOutcome } from "@/core/quality/retry-policy";
import { recordGeneration, learnedModelQuality } from "@/core/learning/records";
import type { ExtractedFrame, FineTune, FrameAnalysis, Generation, GenerationAttempt, Job, QualityScores } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { Reporter } from "./runner";
import { labelFor } from "./stages";
import { specForProject } from "./analyze-job";

const log = logger("generate");

const FRIENDLY_FAIL = "We couldn't build that transition from these clips. Try another style, or a different cut point.";

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

    for (let n = 1; n <= maxAttempts; n++) {
      const durationSec = durationFor(recipe, fineTune);
      const ir = compileIR({ a: analysisA, b: analysisB, pair: pairRow.data, recipe, hints: opp.hints, fineTune, durationSec, aspectRatio: aspect, attempt: n });
      const learned = learnedModelQuality([recipe.id]);
      const model = routeModels({ recipe, mode: gen.mode, exclude, learned })[0] ?? LOCAL_MODEL;
      const provider = getProvider(model.providerId);
      const prompt = renderPrompt(ir, model.dialect);
      const rawPath = path.join(dir, `attempt_${n}_raw.mp4`);
      const attempt = Attempts.create({
        generationId: gen.id, n, recipeId: recipe.id, providerId: model.providerId, modelId: model.id, promptIR: ir, compiledPrompt: prompt,
        params: { durationSec, fineTune, mode: gen.mode }, status: "running", providerJobId: null, outputPath: null, error: null, costUsd: 0, durationMs: 0,
      });
      attempts.push(attempt);
      setStage(n > 1 ? "retry" : "generate", 0.15 + (n - 1) * 0.2, n > 1 ? labelFor("retry") : `${labelFor("generate")} · ${model.label}`);
      log.info("attempt", { gen: gen.id, n, recipe: recipe.id, model: model.id, durationSec });
      const ta = Date.now();
      try {
        const result = await provider.generateTransition({
          firstFramePath: frameA.path, lastFramePath: frameB.path, prompt, durationSec, aspectRatio: aspect, outputPath: rawPath,
          transitionType: recipe.id, motionStrength: ir.motionStrength,
          local: { spec, recipe, focusA: focusPoint(analysisA, frameA, recipe, opp.hints.shapeA), focusB: focusPoint(analysisB, frameB, recipe, opp.hints.shapeB) },
          onProgress: (m) => setStage(n > 1 ? "retry" : "generate", 0.25 + (n - 1) * 0.2, m),
        }, model);
        const bridgePath = path.join(dir, `attempt_${n}_bridge.mp4`);
        await normalizeBridge(result.outputPath, bridgePath, spec, durationSec);
        setStage("judge", 0.55 + (n - 1) * 0.1);
        const judged = await judgeTransition({ bridgePath, sourceFrame: frameA.path, destFrame: frameB.path, recipe, prompt: prompt.positive, tmpDir: dir, cheap: model.providerId === "local" });
        Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: passes(judged.scores) });
        const cost = result.costUsd + judged.costUsd;
        if (result.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "generation", providerId: model.providerId, modelId: model.id, units: result.rawDurationSec, usd: result.costUsd });
        if (judged.costUsd > 0) Costs.add({ attemptId: attempt.id, generationId: gen.id, kind: "judge", providerId: "openai", modelId: config.openai.judgeModel, units: 1, usd: judged.costUsd });
        const ok = passes(judged.scores);
        Attempts.update(attempt.id, { status: ok ? "succeeded" : "rejected", providerJobId: result.providerJobId, outputPath: bridgePath, costUsd: cost, durationMs: Date.now() - ta, params: { ...attempt.params, ...result.params } });
        attempt.recipeId = recipe.id; attempt.durationMs = Date.now() - ta; attempt.status = ok ? "succeeded" : "rejected";
        if (!best || judged.scores.overall > best.scores.overall) best = { attempt, bridgePath, scores: judged.scores, model, recipe, durationSec };
        if (model.providerId === "local" && n > 1) fellBackToLocal = true;
        if (ok) break;
        log.warn("quality rejected", { gen: gen.id, n, overall: judged.scores.overall, issues: judged.scores.issues });
        outcomes.push({ kind: "quality", message: judged.scores.issues.join("; "), scores: judged.scores, modelId: model.id });
      } catch (e) {
        const msg = (e as Error).message;
        log.warn("attempt failed", { gen: gen.id, n, error: msg });
        Attempts.update(attempt.id, { status: "failed", error: msg, durationMs: Date.now() - ta });
        attempt.status = "failed"; attempt.durationMs = Date.now() - ta;
        outcomes.push({ kind: "error", message: msg, scores: null, modelId: model.id });
      }
      const next = planNextAttempt({ attempt: n, maxAttempts, recipe, fineTune, outcomes, opportunities: opps });
      if (!next) break;
      setStage("retry", 0.2 + n * 0.15, next.userMessage);
      recipe = getRecipe(next.recipeId);
      fineTune = next.fineTune;
      exclude = [...new Set([...exclude, ...next.excludeModels])];
      if (next.suggestion) suggestion = next.suggestion;
    }

    // Guarantee an output: procedural bridge with the safest recipe.
    if (!best) {
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
      Quality.create({ attemptId: attempt.id, judge: judged.judge, scores: judged.scores, passed: true });
      Attempts.update(attempt.id, { status: "succeeded", outputPath: bridgePath, durationMs: Date.now() - ta });
      attempt.durationMs = Date.now() - ta; attempt.status = "succeeded";
      best = { attempt, bridgePath, scores: judged.scores, model: LOCAL_MODEL, recipe: safe, durationSec };
      fellBackToLocal = true;
      suggestion = suggestion ?? `This footage is fighting the ${getRecipe(gen.recipeId).name.toLowerCase()}. A ${safe.name.toLowerCase()} will likely look cleaner.`;
    }

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
    Generations.update(gen.id, { status: "failed", stage: "failed", stageLabel: labelFor("failed"), friendlyError: FRIENDLY_FAIL });
    Events.track("generation_failed", { userId: project.userId, projectId: gen.projectId, generationId: gen.id, props: { error: msg } });
    throw e;
  }
}
