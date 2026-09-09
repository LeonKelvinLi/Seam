/**
 * QualityJudge facade (spec §12). OpenAI when configured (heuristic fidelity acts as a floor so a
 * generous model cannot pass a bridge that visibly does not start/end on the right frames);
 * heuristic only for procedural bridges or when the model is unavailable.
 */
import { openaiErrorSummary } from "@/core/openai";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { QualityScores } from "@/core/types";
import { openaiJudge } from "./openai-judge";
import { heuristicJudge } from "./heuristic-judge";

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

export async function judgeTransition(input: JudgeInput): Promise<{ scores: QualityScores; judge: "openai" | "heuristic"; costUsd: number }> {
  const heuristic = await heuristicJudge(input.bridgePath, input.sourceFrame, input.destFrame, input.tmpDir);
  if (!input.cheap && config.openai.enabled) {
    try {
      const r = await openaiJudge(input.bridgePath, input.sourceFrame, input.destFrame, input.recipe, input.prompt);
      const merged: QualityScores = {
        ...r.scores,
        startFidelity: Math.min(r.scores.startFidelity, heuristic.startFidelity + 25),
        endFidelity: Math.min(r.scores.endFidelity, heuristic.endFidelity + 25),
        issues: [...new Set([...r.scores.issues, ...heuristic.issues])],
      };
      merged.overall = Math.round(Math.min(r.scores.overall, (merged.startFidelity + merged.endFidelity) / 2 + 20));
      return { scores: merged, judge: "openai", costUsd: r.costUsd };
    } catch (e) {
      log.warn("OpenAI judge failed, using heuristic", { error: openaiErrorSummary(e) });
    }
  }
  return { scores: heuristic, judge: "heuristic", costUsd: 0 };
}

export function thresholdFor(mode: "preview" | "final" = "final"): number {
  return mode === "preview" ? config.generation.qualityThresholdPreview : config.generation.qualityThreshold;
}

export function passes(scores: QualityScores, mode: "preview" | "final" = "final"): boolean {
  return scores.overall >= thresholdFor(mode) && scores.startFidelity >= 45 && scores.endFidelity >= 45;
}
