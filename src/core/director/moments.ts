/**
 * Footage curation for the multi-clip director (Phase 2): keep only the strongest moments.
 * Works on the cheap per-frame features we already compute, so it costs nothing to run on a
 * whole folder of clips before any model is called.
 *
 * Doctrine encoded here:
 *  - think in moments, not clips: a 10s clip with 1.5s of excellent footage contributes 1.5s
 *  - every shot must earn its place: drop anything whose removal would not make the edit worse
 *  - diversity: near-duplicate moments collapse to the single best version
 *  - order: hook -> visual progression -> strongest moments -> satisfying ending
 */
import type { FrameFeatures } from "@/core/types";
import { colorSimilarity } from "@/core/analysis/features";

export interface TimedFeatures { t: number; features: FrameFeatures }
export interface Moment { clipId: string; start: number; end: number; score: number; energy: number; reasons: string[] }

/** Frame quality on its own: sharp, lit, contrasty, with real content (not one flat wall). */
export function frameQuality(f: FrameFeatures): number {
  const lit = 1 - Math.min(1, Math.abs(f.brightness - 0.5) * 1.8);
  const content = 1 - Math.max(0, f.uniformCoverage - 0.45) * 1.6;
  return Math.max(0, Math.min(1, f.sharpness * 0.4 + lit * 0.2 + f.contrast * 0.15 + Math.min(1, f.edgeDensity * 3) * 0.1 + content * 0.15));
}

/** Motion that is interesting: some movement is good, chaos is not. */
function motionInterest(frames: TimedFeatures[]): number {
  const m = frames.map((x) => x.features.motion);
  const avg = m.reduce((a, b) => a + b, 0) / Math.max(1, m.length);
  return avg < 0.05 ? 0.35 : avg < 0.45 ? 0.6 + (avg / 0.45) * 0.4 : Math.max(0.2, 1 - (avg - 0.45) * 1.5);
}

export function bestMoments(clipId: string, frames: TimedFeatures[], windowSec: number, maxMoments = 3, minGapSec = 0.5): Moment[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const windows: Moment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].t;
    const inWin = sorted.filter((f) => f.t >= start && f.t < start + windowSec);
    if (inWin.length < 2 && sorted.length > 1) continue;
    const q = inWin.reduce((s, f) => s + frameQuality(f.features), 0) / inWin.length;
    const energy = motionInterest(inWin);
    const reasons: string[] = [];
    if (q > 0.6) reasons.push("sharp and well lit");
    if (energy > 0.8) reasons.push("good movement");
    if (q < 0.35) reasons.push("soft or badly lit");
    windows.push({ clipId, start, end: Math.min(start + windowSec, sorted[sorted.length - 1].t), score: q * 0.7 + energy * 0.3, energy, reasons });
  }
  const picked: Moment[] = [];
  for (const w of windows.sort((a, b) => b.score - a.score)) {
    if (picked.some((p) => Math.abs(p.start - w.start) < windowSec + minGapSec)) continue;
    picked.push(w);
    if (picked.length >= maxMoments) break;
  }
  return picked.sort((a, b) => b.score - a.score);
}

function representative(frames: TimedFeatures[], m: Moment): FrameFeatures {
  const inWin = frames.filter((f) => f.t >= m.start && f.t <= m.end);
  return (inWin[Math.floor(inWin.length / 2)] ?? frames[0]).features;
}

/**
 * Select and order moments across many clips for a target length.
 * "If I removed this shot, would the video be worse?" is applied as a marginal-value cut:
 * a moment must beat 60% of the best score, and must not look like one already chosen.
 */
export function curate(clips: { clipId: string; frames: TimedFeatures[] }[], targetSec: number, windowSec = 1.5): Moment[] {
  const candidates = clips.flatMap((c) => bestMoments(c.clipId, c.frames, windowSec));
  const best = Math.max(0, ...candidates.map((c) => c.score));
  const chosen: Moment[] = [];
  let total = 0;
  const byClip = new Map(clips.map((c) => [c.clipId, c.frames]));
  for (const m of candidates.sort((a, b) => b.score - a.score)) {
    if (m.score < best * 0.6) break;
    const rep = representative(byClip.get(m.clipId)!, m);
    const dup = chosen.some((c) => colorSimilarity(representative(byClip.get(c.clipId)!, c), rep) > 0.9 && Math.abs(c.energy - m.energy) < 0.15);
    if (dup) continue;
    if (total + (m.end - m.start) > targetSec + windowSec / 2) continue;
    chosen.push(m);
    total += m.end - m.start;
    if (total >= targetSec) break;
  }
  return orderForStory(chosen);
}

/** Hook (most energetic strong shot) -> progression (rising score) -> strongest -> calm, sharp ending. */
export function orderForStory(moments: Moment[]): Moment[] {
  if (moments.length <= 2) return moments;
  const pool = [...moments];
  const hook = pool.sort((a, b) => b.energy * 0.6 + b.score * 0.4 - (a.energy * 0.6 + a.score * 0.4))[0];
  pool.splice(pool.indexOf(hook), 1);
  const ending = pool.sort((a, b) => a.energy - b.energy)[0];
  pool.splice(pool.indexOf(ending), 1);
  const middle = pool.sort((a, b) => a.score - b.score); // rising toward the strongest moment
  return [hook, ...middle, ending];
}
