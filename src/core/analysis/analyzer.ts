/**
 * VisionAnalyzer facade: Claude when configured, heuristic otherwise, and heuristic as a
 * safety net whenever the model call fails. Callers never branch on which one ran.
 */
import { config } from "@/core/config";
import { logger } from "@/core/log";
import type { FrameAnalysis, FrameFeatures, PairAnalysis } from "@/core/types";
import { claudeAnalyzeFrames, claudeAnalyzePair } from "./claude-analyzer";
import { heuristicFrame, heuristicPair } from "./heuristic-analyzer";

const log = logger("analyzer");

export interface FrameInput { path: string; t: number; features: FrameFeatures; next?: FrameFeatures }
export interface AnalyzerResult<T> { data: T; analyzer: "claude" | "heuristic"; costUsd: number }

export async function analyzeFrames(frames: FrameInput[], side: "start" | "end"): Promise<AnalyzerResult<FrameAnalysis[]>> {
  if (config.anthropic.enabled) {
    try {
      const r = await claudeAnalyzeFrames(frames, side);
      return { data: r.frames, analyzer: "claude", costUsd: r.costUsd };
    } catch (e) {
      log.warn("claude frame analysis failed, using heuristic", { error: (e as Error).message });
    }
  }
  return { data: frames.map((f) => heuristicFrame(f.features, f.next)), analyzer: "heuristic", costUsd: 0 };
}

export async function analyzePair(
  a: { path: string; analysis: FrameAnalysis; features: FrameFeatures },
  b: { path: string; analysis: FrameAnalysis; features: FrameFeatures },
  structuralSimilarity: number,
): Promise<AnalyzerResult<PairAnalysis>> {
  const fallback = heuristicPair(a.analysis, a.features, b.analysis, b.features, structuralSimilarity);
  if (config.anthropic.enabled) {
    try {
      const r = await claudeAnalyzePair(a, b);
      // Merge: keep the model's relationships/ideas, and add heuristic relationships it did not mention.
      const kinds = new Set(r.pair.relationships.map((x) => x.kind));
      for (const rel of fallback.relationships) if (!kinds.has(rel.kind)) r.pair.relationships.push({ ...rel, confidence: rel.confidence * 0.7 });
      return { data: r.pair, analyzer: "claude", costUsd: r.costUsd };
    } catch (e) {
      log.warn("claude pair analysis failed, using heuristic", { error: (e as Error).message });
    }
  }
  return { data: fallback, analyzer: "heuristic", costUsd: 0 };
}
