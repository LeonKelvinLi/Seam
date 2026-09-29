/**
 * Boundary frame selection (spec §13). We do not blindly use the last frame of A and the first
 * frame of B: we sample a window on each side of the cut, score every frame, and hand the best
 * few candidates to the analyzer. The final pair is chosen with the analysis in hand.
 */
import type { ExtractedFrame, FrameAnalysis, FrameFeatures } from "@/core/types";
import { colorSimilarity } from "./features";

/**
 * How good a frame is as a cut point on its own: sharp, lit, and calm. Bridge models start on the frame and hold it
 * for about a second before moving (Higgsfield's Transitions app did in 22 of 22 renders, scripts/hf-study.py), so a
 * cut in the middle of a movement stops that movement dead at the join.
 */
export function boundaryScore(f: FrameFeatures, next?: FrameFeatures): number {
  const lit = 1 - Math.abs(f.brightness - 0.5) * 1.6;
  const occluderComing = next ? Math.max(0, next.uniformCoverage - f.uniformCoverage) : 0;
  return Math.max(0, Math.min(1,
    f.sharpness * 0.35 + Math.max(0, lit) * 0.2 + f.edgeDensity * 0.1 + (1 - f.motion) * 0.3 + occluderComing * 0.5,
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
 * so proximity to the literal boundary is rewarded; occlusions, colour continuity and calm footage are rewarded more.
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
    // Moving on either side of a join meets the bridge's still hold: outweighs keeping the last half second of A.
    // Hand-held gestures register only 0.1-0.15 in features.motion, so small movement already counts as busy.
    const calm = 1 - Math.min(1, Math.max(a.features.motion, b.features.motion) * 4);
    const score =
      (a.boundaryScore + b.boundaryScore) * 0.2 + ((nearA + nearB) / 2) * 0.25 + color * 0.2 + occl * 0.25 + calm * 0.2 - facePenalty;
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) throw new Error("no boundary frames available");
  return best;
}
