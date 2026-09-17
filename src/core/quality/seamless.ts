/**
 * Pixel check for the two things Clipmelt never ships: a cross-dissolve (both shots on screen while one fades into the
 * other) and a hard cut. First-last-frame models fall back to exactly these when they find no continuous move between
 * two unrelated frames. On 2026-09-10 DoP Lite held a paper plane still for 3.5 s and then cross-dissolved to an
 * airliner, and the vision judge still scored the take 73.
 *
 * Dissolve: a frame C, with frames A and B k frames either side of it, that a weighted mix of A and B explains almost
 * exactly (R² > 0.95 on mean-removed luma, both weights > 0.15), while A and B are different pictures (correlation
 * < 0.6) and neither alone explains C (the mix explains at least 0.1 more). A real camera move or morph puts detail
 * where neither endpoint had it, so the mix does not fit. Cut: one frame-to-frame change of at least 0.5 (1 minus
 * correlation) that is 6 times larger than every change within 3 frames of it.
 *
 * Calibrated 2026-09-10 on 160x90 luma at 30 fps. No false positives on 29 reviewed AI bridges, 16 synthetic camera
 * moves or 16 sped-up real clips; the closest reviewed bridge reached a dissolve gain of 0.04 and a cut spike of 3.8.
 * Caught: the DoP dissolve (gain 0.32), all 16 still-shot dissolves (0.18 to 0.48), 5 of 8 dissolves between moving
 * shots, and all 8 cuts (spike 8.6 or more). What this misses is left to the vision judge.
 */
import { spawn } from "node:child_process";
import { config } from "@/core/config";

export const SEAM_W = 160;
export const SEAM_H = 90;
export const SEAM_FPS = 30;
const PX = SEAM_W * SEAM_H;

const DISSOLVE = { minFit: 0.95, minWeight: 0.15, maxEndpointCorrelation: 0.6, minGain: 0.1, maxReach: 15 };
const CUT = { minChange: 0.5, minSpike: 6, window: 3 };

export interface SeamBreak { kind: "dissolve" | "cut"; atSec: number; strength: number }

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The strongest dissolve and the strongest cut in a run of SEAM_W x SEAM_H luma frames, if any. */
export function findSeamBreaks(frames: ArrayLike<number>[], fps = SEAM_FPS): SeamBreak[] {
  const n = frames.length;
  if (n < 3) return [];
  const centered = frames.map((f) => {
    const c = new Float64Array(PX);
    let mean = 0;
    for (let i = 0; i < PX; i++) mean += f[i];
    mean /= PX;
    for (let i = 0; i < PX; i++) c[i] = f[i] - mean;
    return c;
  });
  const G = centered.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      const a = centered[i], b = centered[j];
      for (let p = 0; p < PX; p++) s += a[p] * b[p];
      G[i][j] = G[j][i] = s;
    }
  }
  const corr = (i: number, j: number) => G[i][j] / Math.sqrt(G[i][i] * G[j][j] + 1e-9);
  const breaks: SeamBreak[] = [];

  let dissolve: { t: number; gain: number } | null = null;
  for (let k = 1; k <= DISSOLVE.maxReach; k++) {
    for (let t = k; t < n - k; t++) {
      const a = t - k, b = t + k;
      if (corr(a, b) >= DISSOLVE.maxEndpointCorrelation) continue;
      const aa = G[a][a], bb = G[b][b], ab = G[a][b], ac = G[a][t], bc = G[b][t], cc = G[t][t];
      const det = aa * bb - ab * ab;
      if (cc <= 0 || det <= 1e-6 * aa * bb) continue;
      const wa = (ac * bb - bc * ab) / det, wb = (bc * aa - ac * ab) / det;
      if (wa <= DISSOLVE.minWeight || wb <= DISSOLVE.minWeight) continue;
      const residual = cc - 2 * wa * ac - 2 * wb * bc + wa * wa * aa + 2 * wa * wb * ab + wb * wb * bb;
      const fit = 1 - residual / cc;
      if (fit <= DISSOLVE.minFit) continue;
      const gain = fit - Math.max(corr(t, a) ** 2, corr(t, b) ** 2);
      if (gain >= DISSOLVE.minGain && (!dissolve || gain > dissolve.gain)) dissolve = { t, gain };
    }
  }
  if (dissolve) breaks.push({ kind: "dissolve", atSec: dissolve.t / fps, strength: round2(dissolve.gain) });

  const change: number[] = [];
  for (let i = 1; i < n; i++) change.push(1 - corr(i - 1, i));
  let cut: { t: number; spike: number } | null = null;
  for (let i = 0; i < change.length; i++) {
    if (change[i] < CUT.minChange) continue;
    let near = 0.002;
    for (let j = Math.max(0, i - CUT.window); j <= Math.min(change.length - 1, i + CUT.window); j++) if (j !== i) near = Math.max(near, change[j]);
    const spike = change[i] / near;
    if (spike >= CUT.minSpike && (!cut || spike > cut.spike)) cut = { t: i + 1, spike };
  }
  if (cut) breaks.push({ kind: "cut", atSec: cut.t / fps, strength: round2(cut.spike) });
  return breaks;
}

/** Luma frames of a video resampled to SEAM_FPS, each SEAM_W x SEAM_H. */
export function decodeLuma(video: string, timeoutMs = 60_000): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", video, "-vf", `fps=${SEAM_FPS},scale=${SEAM_W}:${SEAM_H}:flags=area,format=gray`, "-f", "rawvideo", "pipe:1"];
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg timed out decoding luma")); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split("\n").slice(-2).join(" | ")}`));
      const all = Buffer.concat(chunks);
      const frames: Uint8Array[] = [];
      for (let o = 0; o + PX <= all.length; o += PX) frames.push(new Uint8Array(all.buffer, all.byteOffset + o, PX));
      resolve(frames);
    });
  });
}

export async function detectSeamBreaks(video: string): Promise<SeamBreak[]> {
  return findSeamBreaks(await decodeLuma(video));
}
