/**
 * VisionAnalyzer facade: OpenAI when configured, heuristic otherwise, and heuristic as a
 * safety net whenever the model call fails. Callers never branch on which one ran.
 */
import { openaiErrorSummary, openaiOutOfCredit } from "@/core/openai";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import type { FrameAnalysis, FrameFeatures, PairAnalysis } from "@/core/types";
import { openaiAnalyzeFrames, openaiAnalyzePair } from "./openai-analyzer";
import { heuristicFrame, heuristicPair } from "./heuristic-analyzer";

const log = logger("analyzer");

export interface FrameInput { path: string; t: number; features: FrameFeatures; next?: FrameFeatures }
export interface AnalyzerResult<T> { data: T; analyzer: "openai" | "heuristic"; costUsd: number }

export async function analyzeFrames(frames: FrameInput[], side: "start" | "end"): Promise<AnalyzerResult<FrameAnalysis[]>> {
  if (config.openai.enabled && !openaiOutOfCredit()) {
    try {
      const r = await openaiAnalyzeFrames(frames, side);
      return { data: r.frames, analyzer: "openai", costUsd: r.costUsd };
    } catch (e) {
      log.warn("OpenAI frame analysis failed, using heuristic", { error: openaiErrorSummary(e) });
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
  if (config.openai.enabled && !openaiOutOfCredit()) {
    try {
      const r = await openaiAnalyzePair(a, b);
      // Merge: keep the model's relationships/ideas, and add heuristic relationships it did not mention.
      const kinds = new Set(r.pair.relationships.map((x) => x.kind));
      for (const rel of fallback.relationships) if (!kinds.has(rel.kind)) r.pair.relationships.push({ ...rel, confidence: rel.confidence * 0.7 });
      return { data: r.pair, analyzer: "openai", costUsd: r.costUsd };
    } catch (e) {
      log.warn("OpenAI pair analysis failed, using heuristic", { error: openaiErrorSummary(e) });
    }
  }
  return { data: fallback, analyzer: "heuristic", costUsd: 0 };
}
