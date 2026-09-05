/**
 * Boundary frame selection (spec §13). We do not blindly use the last frame of A and the first
 * frame of B: we sample a window on each side of the cut, score every frame, and hand the best
 * few candidates to the analyzer. The final pair is chosen with the analysis in hand.
 */
import type { ExtractedFrame, FrameAnalysis, FrameFeatures } from "@/core/types";
import { colorSimilarity } from "./features";

/** How good a frame is as a cut point on its own: sharp, lit, not mid-motion-blur. */
export function boundaryScore(f: FrameFeatures, next?: FrameFeatures): number {
  const lit = 1 - Math.abs(f.brightness - 0.5) * 1.6;
  const occluderComing = next ? Math.max(0, next.uniformCoverage - f.uniformCoverage) : 0;
  return Math.max(0, Math.min(1,
    f.sharpness * 0.45 + Math.max(0, lit) * 0.2 + f.edgeDensity * 0.15 + (1 - f.motion) * 0.1 + occluderComing * 0.5,
  ));
}

/** Pick up to `count` candidates, spread out in time (non-max suppression), best first. */
export function pickCandidates(frames: ExtractedFrame[], count: number, minGapSec = 0.25): ExtractedFrame[] {
  const sorted = [...frames].sort((a, b) => b.boundaryScore - a.boundaryScore);
  const out: ExtractedFrame[] = [];
  for (const f of sorted) {
    if (out.some((o) => Math.abs(o.t - f.t) < minGapSec)) continue;
    out.push(f);
    if (out.length >= count) break;
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface PairChoice { a: ExtractedFrame; b: ExtractedFrame; score: number }

/**
 * Choose the boundary pair. Later frames of A / earlier frames of B keep more of the user's footage,
 * so proximity to the literal boundary is rewarded; occlusions and colour continuity are rewarded more.
 */
export function chooseBoundaryPair(
  aFrames: ExtractedFrame[], bFrames: ExtractedFrame[],
  analyses: Map<string, FrameAnalysis>, aEndT: number, bStartT: number, windowSec: number,
): PairChoice {
  let best: PairChoice | null = null;
  for (const a of aFrames) for (const b of bFrames) {
    const aa = analyses.get(a.id), ab = analyses.get(b.id);
    const nearA = 1 - Math.min(1, (aEndT - a.t) / windowSec);
    const nearB = 1 - Math.min(1, (b.t - bStartT) / windowSec);
    const occl = Math.max(aa?.occlusionOpportunity ?? 0, a.features.uniformCoverage > 0.8 ? 0.6 : 0);
    const color = colorSimilarity(a.features, b.features);
    const facePenalty = (aa?.facesNearEdge ? 0.1 : 0) + (ab?.facesNearEdge ? 0.1 : 0);
    const score =
      (a.boundaryScore + b.boundaryScore) * 0.2 + ((nearA + nearB) / 2) * 0.25 + color * 0.2 + occl * 0.25 - facePenalty;
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) throw new Error("no boundary frames available");
  return best;
}
