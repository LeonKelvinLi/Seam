/**
 * Model-free quality judge: compares the bridge's first/last frames to the boundary frames,
 * and looks for flicker / mush across sampled frames. Used alone when Claude is not configured,
 * and always for the procedural (local) provider.
 */
import path from "node:path";
import { sampleFrames } from "@/core/media/ffmpeg";
import { gray } from "@/core/media/image";
import { structuralSimilarity, type Raster } from "@/core/analysis/features";
import type { QualityScores } from "@/core/types";

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function sharpness(g: Raster): number {
  let s = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w - 1; x++) s += Math.abs(g.data[y * g.w + x + 1] - g.data[y * g.w + x]);
  return Math.min(1, s / (g.w * g.h) / 40);
}

export async function heuristicJudge(bridgePath: string, sourceFrame: string, destFrame: string, tmpDir: string): Promise<QualityScores> {
  const samples = await sampleFrames(bridgePath, path.join(tmpDir, "judge"), 7, "judge");
  const rasters = await Promise.all(samples.map((s) => gray(s.path, 48)));
  const [src, dst] = await Promise.all([gray(sourceFrame, 48), gray(destFrame, 48)]);
  const first = rasters[0], last = rasters[rasters.length - 1];

  const startFidelity = structuralSimilarity(first, src) * 100;
  const endFidelity = structuralSimilarity(last, dst) * 100;

  const diffs: number[] = [];
  for (let i = 1; i < rasters.length; i++) {
    let d = 0;
    for (let k = 0; k < first.data.length; k++) d += Math.abs(rasters[i].data[k] - rasters[i - 1].data[k]);
    diffs.push(d / first.data.length / 255);
  }
  const avg = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
  const max = Math.max(...diffs, 0);
  const flicker = Math.max(0, max - avg * 2.2);
  const continuity = 100 - flicker * 320;

  const sharp = rasters.map(sharpness);
  const minSharp = Math.min(...sharp);
  const artifacts = 84 - (minSharp < 0.08 ? 25 : 0);
  const aesthetic = 55 + (sharp.reduce((a, b) => a + b, 0) / sharp.length) * 45;
  const mid = rasters[Math.floor(rasters.length / 2)];
  const subjectConsistency = 60 + ((structuralSimilarity(mid, src) + structuralSimilarity(mid, dst)) / 2) * 40;
  const transitionSuccess = 60 + (startFidelity > 55 ? 20 : 0) + (endFidelity > 55 ? 20 : 0);
  const issues: string[] = [];
  if (startFidelity < 55) issues.push("start does not match the source frame");
  if (endFidelity < 55) issues.push("end does not match the destination frame");
  if (flicker > 0.12) issues.push("abrupt jump mid-transition");
  if (minSharp < 0.08) issues.push("very soft frames");

  const overall = startFidelity * 0.25 + endFidelity * 0.25 + continuity * 0.15 + artifacts * 0.15 + aesthetic * 0.1 + subjectConsistency * 0.1;
  return {
    startFidelity: clamp(startFidelity), endFidelity: clamp(endFidelity), subjectConsistency: clamp(subjectConsistency),
    continuity: clamp(continuity), artifacts: clamp(artifacts), aesthetic: clamp(aesthetic), transitionSuccess: clamp(transitionSuccess),
    overall: clamp(overall), issues,
  };
}
