/**
 * Cheap, model-free frame statistics. Used for boundary frame selection, the heuristic analyzer,
 * the heuristic quality judge, and as a sanity layer on top of vision-model output.
 */
import { gray, rgb } from "@/core/media/image";
import type { FrameFeatures } from "@/core/types";

export interface Raster { data: Uint8Array; w: number; h: number }

export async function loadRasters(path: string): Promise<{ g: Raster; c: Raster }> {
  const [g, c] = await Promise.all([gray(path, 64), rgb(path, 32)]);
  return { g, c };
}

function gradients(g: Raster): { mag: Float32Array; mean: number } {
  const { data, w, h } = g;
  const mag = new Float32Array(w * h);
  let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x + 1 < w ? Math.abs(data[i + 1] - data[i]) : 0;
      const gy = y + 1 < h ? Math.abs(data[i + w] - data[i]) : 0;
      mag[i] = gx + gy;
      sum += mag[i];
    }
  }
  return { mag, mean: sum / (w * h) };
}

/** Best 1-D shift (in pixels) aligning profile b onto a, searched in [-max, max]. */
function bestShift(a: Float64Array, b: Float64Array, max: number): number {
  let best = 0, bestErr = Infinity;
  for (let s = -max; s <= max; s++) {
    let err = 0, n = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i + s;
      if (j < 0 || j >= b.length) continue;
      const d = a[i] - b[j];
      err += d * d; n++;
    }
    if (n > 0) { err /= n; if (err < bestErr) { bestErr = err; best = s; } }
  }
  return best;
}

function profiles(g: Raster): { cols: Float64Array; rows: Float64Array } {
  const cols = new Float64Array(g.w), rows = new Float64Array(g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const v = g.data[y * g.w + x]; cols[x] += v; rows[y] += v; }
  for (let x = 0; x < g.w; x++) cols[x] /= g.h;
  for (let y = 0; y < g.h; y++) rows[y] /= g.w;
  return { cols, rows };
}

export function dominantColors(c: Raster, count = 3): string[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < c.w * c.h; i++) {
    const r = c.data[i * 3], g = c.data[i * 3 + 1], b = c.data[i * 3 + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  return [...bins.values()].sort((a, b) => b.n - a.n).slice(0, count).map((e) => {
    const h = (v: number) => Math.round(v / e.n).toString(16).padStart(2, "0");
    return `#${h(e.r)}${h(e.g)}${h(e.b)}`;
  });
}

export function computeFeatures(cur: { g: Raster; c: Raster }, prev?: { g: Raster; c: Raster }): FrameFeatures {
  const { g, c } = cur;
  const n = g.w * g.h;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += g.data[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) { const d = g.data[i] - mean; varSum += d * d; }
  const std = Math.sqrt(varSum / n);

  const { mag, mean: gradMean } = gradients(g);
  let edgeCount = 0, fx = 0, fy = 0, ftot = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const m = mag[y * g.w + x];
    if (m > 24) edgeCount++;
    fx += x * m; fy += y * m; ftot += m;
  }
  const focus = ftot > 0 ? { x: fx / ftot / (g.w - 1), y: fy / ftot / (g.h - 1) } : { x: 0.5, y: 0.5 };

  // Largest luminance bucket = how much of the frame is one flat region (wall, sky, occluder).
  const hist = new Array<number>(16).fill(0);
  for (let i = 0; i < n; i++) hist[g.data[i] >> 4]++;
  const uniformCoverage = Math.max(...hist) / n;

  let motion = 0, driftX = 0, driftY = 0;
  if (prev) {
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(g.data[i] - prev.g.data[i]);
    motion = Math.min(1, (diff / n / 255) * 4);
    const pa = profiles(prev.g), pb = profiles(g);
    driftX = bestShift(pa.cols, pb.cols, 8) / g.w;
    driftY = bestShift(pa.rows, pb.rows, 8) / g.h;
  }

  return {
    sharpness: Math.min(1, gradMean / 40),
    brightness: mean / 255,
    contrast: Math.min(1, (std / 255) * 3),
    edgeDensity: edgeCount / n,
    motion,
    driftX,
    driftY,
    uniformCoverage,
    dominantColors: dominantColors(c),
    focus,
  };
}

/** Similarity of two frames' colour palettes and luminance, 0..1. */
export function colorSimilarity(a: FrameFeatures, b: FrameFeatures): number {
  const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  let best = 0;
  for (const ca of a.dominantColors) for (const cb of b.dominantColors) {
    const [r1, g1, b1] = hex(ca), [r2, g2, b2] = hex(cb);
    const d = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441;
    best = Math.max(best, 1 - d);
  }
  const lum = 1 - Math.abs(a.brightness - b.brightness);
  return Math.max(0, Math.min(1, best * 0.65 + lum * 0.35));
}

/** Structural similarity between two grayscale rasters (correlation of pixels), 0..1. */
export function structuralSimilarity(a: Raster, b: Raster): number {
  const n = Math.min(a.data.length, b.data.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a.data[i]; mb += b.data[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a.data[i] - ma, y = b.data[i] - mb; num += x * y; da += x * x; db += y * y; }
  const corr = da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  let mad = 0;
  for (let i = 0; i < n; i++) mad += Math.abs(a.data[i] - b.data[i]);
  mad = mad / n / 255;
  return Math.max(0, Math.min(1, ((corr + 1) / 2) * 0.6 + (1 - mad) * 0.4));
}
