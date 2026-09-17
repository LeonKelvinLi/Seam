/**
 * QualityJudge facade (spec §12). OpenAI when configured (heuristic fidelity acts as a floor so a
 * generous model cannot pass a bridge that visibly does not start/end on the right frames);
 * heuristic only for procedural bridges or when the model is unavailable. Every AI take also goes through the
 * pixel check for dissolves and cuts (./seamless), which no score can override.
 */
import { openaiErrorSummary } from "@/core/openai";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { QualityScores } from "@/core/types";
import { openaiJudge } from "./openai-judge";
import { heuristicJudge } from "./heuristic-judge";
import { detectSeamBreaks, type SeamBreak } from "./seamless";
import { passesStyle } from "./style";

const log = logger("quality");

export interface JudgeInput {
  bridgePath: string;
  sourceFrame: string;
  destFrame: string;
  recipe: TransitionRecipe;
  prompt: string;
  tmpDir: string;
  /** Skip the model judge (procedural output). */
  cheap: boolean;
}

type Judged = { scores: QualityScores; judge: "openai" | "heuristic" | "unavailable"; costUsd: number };

/**
 * Pixel statistics cannot tell a blend from a morph: the heuristic scored 93 a take the vision judge failed at 45
 * (2026-09-16). When the vision judge is configured but no model answers, an AI take is refused rather than shipped.
 */
export const UNJUDGED_CAP = 60;
export const JUDGE_UNAVAILABLE = "The quality check was unavailable, so this take was not accepted.";

export async function judgeTransition(input: JudgeInput): Promise<Judged> {
  // The pixel check runs on every AI take, with or without OpenAI. The procedural bridge is a crossfade by design.
  const [judged, breaks] = await Promise.all([scoreTransition(input), input.cheap ? Promise.resolve(null) : seamBreaks(input.bridgePath)]);
  return { ...judged, scores: breaks ? applySeamBreaks(judged.scores, breaks) : judged.scores };
}

async function seamBreaks(bridgePath: string): Promise<SeamBreak[] | null> {
  try {
    return await detectSeamBreaks(bridgePath);
  } catch (e) {
    log.warn("seam check failed; the judge decides alone", { error: (e as Error).message });
    return null;
  }
}

/**
 * A dissolve or a cut is a failed transition however good the rest looks. Name it first and cap the scores, so the
 * stored evaluation, the retry policy and the learned model ranking all record a failure.
 */
export function applySeamBreaks(scores: QualityScores, breaks: SeamBreak[]): QualityScores {
  if (!breaks.length) return { ...scores, seamless: true };
  const named = breaks.map((b) => b.kind === "dissolve"
    ? `Cross-dissolve at ${b.atSec.toFixed(2)}s: both shots are on screen at once instead of one continuous move`
    : `Hard cut at ${b.atSec.toFixed(2)}s instead of one continuous move`);
  return {
    ...scores, seamless: false, issues: [...named, ...scores.issues].slice(0, 8),
    continuity: Math.min(scores.continuity, 30), transitionSuccess: Math.min(scores.transitionSuccess, 30), overall: Math.min(scores.overall, 50),
  };
}

async function scoreTransition(input: JudgeInput): Promise<Judged> {
  // Start the vision request without waiting for the independent pixel-fidelity check. Neither result is accepted
  // until both finish, and the same fidelity floor and unavailable-judge rejection still apply.
  const [heuristic, vision] = await Promise.all([
    heuristicJudge(input.bridgePath, input.sourceFrame, input.destFrame, input.tmpDir),
    scoreWithVision(input),
  ]);
  if (!input.cheap) {
    if (vision) {
      const merged: QualityScores = {
        ...vision.scores,
        startFidelity: Math.min(vision.scores.startFidelity, heuristic.startFidelity + 25),
        endFidelity: Math.min(vision.scores.endFidelity, heuristic.endFidelity + 25),
        issues: [...new Set([...vision.scores.issues, ...heuristic.issues])],
      };
      merged.overall = Math.round(Math.min(vision.scores.overall, (merged.startFidelity + merged.endFidelity) / 2 + 20));
      return { scores: merged, judge: "openai", costUsd: vision.costUsd };
    }
    return {
      scores: { ...heuristic, overall: Math.min(heuristic.overall, UNJUDGED_CAP), issues: [JUDGE_UNAVAILABLE, ...heuristic.issues].slice(0, 8) },
      judge: "unavailable", costUsd: 0,
    };
  }
  return { scores: heuristic, judge: "heuristic", costUsd: 0 };
}

async function scoreWithVision(input: JudgeInput) {
  if (input.cheap || !config.openai.enabled) return null;
  const models = [...new Set([config.openai.judgeModel, config.openai.judgeFallbackModel].filter(Boolean))];
  for (const model of models) {
    try {
      return await openaiJudge(input.bridgePath, input.sourceFrame, input.destFrame, input.recipe, input.prompt, undefined, model);
    } catch (e) {
      log.warn("OpenAI judge failed", { model, error: openaiErrorSummary(e) });
    }
  }
  return null;
}

export function thresholdFor(mode: "preview" | "final" = "final"): number {
  return mode === "preview" ? config.generation.qualityThresholdPreview : config.generation.qualityThreshold;
}

export function passes(scores: QualityScores, mode: "preview" | "final" = "final"): boolean {
  return scores.seamless !== false && passesStyle(scores) && scores.overall >= thresholdFor(mode) && scores.startFidelity >= 45 && scores.endFidelity >= 45;
}
