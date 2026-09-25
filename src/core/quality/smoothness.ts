/**
 * How noticeable a transition is, measured rather than judged. A seamless edit has no single frame that changes much
 * more than its neighbours (a "jolt") and no sudden change of motion speed across a join (a "lurch", e.g. real footage
 * at 1x meeting an AI bridge played 2.5x faster). Both are read from the mean frame-to-frame difference of a small grey
 * copy of the video, so the numbers are deterministic and cheap, unlike a vision judge.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg } from "@/core/media/ffmpeg";

const W = 64, H = 112;

/** Mean absolute difference (0..255) between consecutive frames; entry i compares frame i+1 with frame i. */
export async function motionSeries(video: string, fps: number): Promise<number[]> {
  const raw = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seam-motion-")), "frames.gray");
  try {
    await ffmpeg(["-i", video, "-vf", `fps=${fps},scale=${W}:${H},format=gray`, "-f", "rawvideo", raw]);
    const buf = fs.readFileSync(raw), size = W * H, n = Math.floor(buf.length / size), out: number[] = [];
    for (let f = 1; f < n; f++) {
      let s = 0;
      for (let i = 0; i < size; i++) s += Math.abs(buf[f * size + i] - buf[(f - 1) * size + i]);
      out.push(s / size);
    }
    return out;
  } finally {
    fs.rmSync(path.dirname(raw), { recursive: true, force: true });
  }
}

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface JoinSmoothness {
  /** Biggest change near the join over the typical change around it. About 1 is invisible; 3+ reads as a cut. */
  jolt: number;
  /** Motion after the join over motion before it (larger / smaller). 1 is continuous; 2 means speed doubles or halves. */
  lurch: number;
}

/** Jolt and lurch at one join (seconds into the video). */
export function joinSmoothness(series: number[], fps: number, joinSec: number): JoinSmoothness {
  const j = Math.round(joinSec * fps) - 1, near = 2, span = Math.round(fps * 0.6);
  const at = (a: number, b: number) => series.slice(Math.max(0, a), Math.max(0, Math.min(series.length, b)));
  const peak = Math.max(0, ...at(j - near, j + near + 1));
  const around = [...at(j - span, j - near - 2), ...at(j + near + 3, j + span)];
  const before = mean(at(j - span, j - near - 1)), after = mean(at(j + near + 2, j + span));
  const floor = 0.6; // nearly still footage: don't divide by noise
  return {
    jolt: peak / Math.max(floor, median(around)),
    lurch: Math.max(before, after, floor) / Math.max(Math.min(before, after), floor),
  };
}

/** Both joins of a stitched A + bridge + B video, and the worst of each measure. */
export async function transitionSmoothness(video: string, fps: number, joins: [number, number]) {
  const series = await motionSeries(video, fps);
  const [a, b] = joins.map((s) => joinSmoothness(series, fps, s));
  return { joinIn: a, joinOut: b, jolt: Math.max(a.jolt, b.jolt), lurch: Math.max(a.lurch, b.lurch) };
}
