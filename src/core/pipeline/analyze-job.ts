/**
 * UPLOAD -> TRANSCODE -> FRAME EXTRACTION -> VISUAL ANALYSIS -> TRANSITION RECOMMENDATIONS
 */
import fs from "node:fs";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { Assets, Costs, Events, Frames, Opportunities, PairAnalyses, Projects, Recommendations, VisualAnalyses } from "@/db/repo";
import { chooseOutputFrame, extractFrames, imageToClip, makeProxy, probe, type FrameSpec } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import { computeFeatures, loadRasters, structuralSimilarity } from "@/core/analysis/features";
import { boundaryScore, chooseBoundaryPair, pickCandidates } from "@/core/analysis/frame-selection";
import { analyzeFrames, analyzePair } from "@/core/analysis/analyzer";
import { scoreOpportunities } from "@/core/opportunities/scorer";
import { recommend } from "@/core/opportunities/recommend";
import type { Asset, ExtractedFrame, FrameAnalysis, Job, Project } from "@/core/types";
import type { Reporter } from "./runner";

const log = logger("analyze");

export function specForProject(p: Project): FrameSpec {
  return { width: p.outputWidth ?? 1280, height: p.outputHeight ?? 720, fps: config.output.fps };
}

async function ensureProxy(asset: Asset, spec: FrameSpec): Promise<Asset> {
  if (asset.proxyPath && fs.existsSync(asset.proxyPath)) return asset;
  const out = storage.proxy(asset.id);
  if (asset.kind === "video") {
    await makeProxy(asset.path, out, spec, asset.hasAudio);
  } else {
    await imageToClip(asset.path, out, spec, config.output.imageHoldSec, asset.role === "start" ? "in" : "out");
  }
  const info = await probe(out);
  Assets.update(asset.id, { proxyPath: out, durationSec: info.durationSec, fps: info.fps });
  return { ...asset, proxyPath: out, durationSec: info.durationSec, fps: info.fps };
}

async function extractBoundaryFrames(asset: Asset): Promise<ExtractedFrame[]> {
  const dur = asset.durationSec ?? 0;
  const W = config.analysis.boundaryWindowSec;
  const [start, end] = asset.role === "start" ? [Math.max(0, dur - W), dur] : [0, Math.min(dur, W)];
  const dir = storage.frameDir(asset.id);
  fs.rmSync(dir, { recursive: true, force: true });
  Frames.clearForAsset(asset.id);
  VisualAnalyses.clearForAsset(asset.id);
  const files = await extractFrames(asset.proxyPath!, dir, start, end - 0.001, config.analysis.candidateFps, asset.role);
  if (files.length === 0) throw new Error(`no frames extracted for ${asset.role} clip`);
  const rasters = await Promise.all(files.map((f) => loadRasters(f.path)));
  const feats = rasters.map((r, i) => computeFeatures(r, i > 0 ? rasters[i - 1] : undefined));
  return files.map((f, i) =>
    Frames.create({ assetId: asset.id, t: Math.min(f.t, Math.max(0, dur - 1 / config.output.fps)), path: f.path, features: feats[i], boundaryScore: boundaryScore(feats[i], feats[i + 1]) }),
  );
}

export async function runAnalyzeJob(job: Job, report: Reporter) {
  const projectId = String(job.payload.projectId);
  const project = Projects.get(projectId);
  if (!project) throw new Error("project not found");
  const startAsset = Assets.byRole(projectId, "start");
  const endAsset = Assets.byRole(projectId, "end");
  if (!startAsset || !endAsset) throw new Error("both clips are required");
  Projects.update(projectId, { status: "analyzing", analysisError: null });
  const t0 = Date.now();
  try {
    // ---- transcode
    report("transcode", 0.05);
    const frame = chooseOutputFrame(startAsset.width ?? 0, startAsset.height ?? 0);
    Projects.update(projectId, { outputWidth: frame.width, outputHeight: frame.height });
    const spec: FrameSpec = { ...frame, fps: config.output.fps };
    const a = await ensureProxy(startAsset, spec);
    report("transcode", 0.15);
    const b = await ensureProxy(endAsset, spec);

    // ---- frames + cheap features
    report("frames", 0.25);
    const aFrames = await extractBoundaryFrames(a);
    const bFrames = await extractBoundaryFrames(b);

    // ---- candidates: best-scoring frames, always including the literal boundary frames
    const n = config.analysis.visionFramesPerSide;
    const aCand = uniq([aFrames[aFrames.length - 1], ...pickCandidates(aFrames, n)]).slice(-n).sort((x, y) => x.t - y.t);
    const bCand = uniq([bFrames[0], ...pickCandidates(bFrames, n)]).slice(0, n).sort((x, y) => x.t - y.t);

    // ---- visual understanding
    report("analysis", 0.4);
    const idx = (frames: ExtractedFrame[], f: ExtractedFrame) => frames.findIndex((x) => x.id === f.id);
    // Neither clip's vision call depends on the other. Keep their outputs ordered while the network work overlaps.
    const visionStart = Date.now();
    const [aRes, bRes] = await Promise.all([
      analyzeFrames(aCand.map((f) => ({ path: f.path, t: f.t, features: f.features, next: aFrames[idx(aFrames, f) + 1]?.features })), "start"),
      analyzeFrames(bCand.map((f) => ({ path: f.path, t: f.t, features: f.features, next: bFrames[idx(bFrames, f) + 1]?.features })), "end"),
    ]);
    const frameVisionMs = Date.now() - visionStart;
    report("analysis", 0.6);
    const analyses = new Map<string, FrameAnalysis>();
    aCand.forEach((f, i) => { analyses.set(f.id, aRes.data[i]); VisualAnalyses.create({ assetId: a.id, frameId: f.id, analyzer: aRes.analyzer, data: aRes.data[i] }); });
    bCand.forEach((f, i) => { analyses.set(f.id, bRes.data[i]); VisualAnalyses.create({ assetId: b.id, frameId: f.id, analyzer: bRes.analyzer, data: bRes.data[i] }); });

    // ---- boundary pair
    const pair = chooseBoundaryPair(aCand, bCand, analyses, a.durationSec ?? 0, 0, config.analysis.boundaryWindowSec);
    report("analysis", 0.75);
    const [ra, rb] = await Promise.all([loadRasters(pair.a.path), loadRasters(pair.b.path)]);
    const structural = structuralSimilarity(ra.g, rb.g);
    const pairRes = await analyzePair(
      { path: pair.a.path, analysis: analyses.get(pair.a.id)!, features: pair.a.features },
      { path: pair.b.path, analysis: analyses.get(pair.b.id)!, features: pair.b.features },
      structural,
    );
    const pairRow = PairAnalyses.create({ projectId, startFrameId: pair.a.id, endFrameId: pair.b.id, analyzer: pairRes.analyzer, data: pairRes.data });

    // ---- opportunities + lanes
    report("recommendations", 0.9);
    const drafts = scoreOpportunities({ a: analyses.get(pair.a.id)!, b: analyses.get(pair.b.id)!, fa: pair.a.features, fb: pair.b.features, pair: pairRes.data });
    // Keep every offered effect: the library shows each one's fit for these clips.
    const opps = Opportunities.replaceForProject(projectId, drafts.map((d, i) => ({ ...d, projectId, pairAnalysisId: pairRow.id, rank: i })));
    const recs = recommend(opps);
    Recommendations.replaceForProject(projectId, recs.map((r) => ({ lane: r.lane, opportunityId: r.opportunity.id })));

    const costUsd = aRes.costUsd + bRes.costUsd + pairRes.costUsd;
    if (costUsd > 0) Costs.add({ attemptId: null, generationId: null, kind: "analysis", providerId: "openai", modelId: config.openai.visionModel, units: 3, usd: costUsd });
    Projects.update(projectId, { status: "analyzed" });
    Events.track("analysis_completed", { userId: project.userId, projectId, props: { ms: Date.now() - t0, frameVisionMs, analyzer: pairRes.analyzer, top: opps[0]?.recipeId, costUsd } });
    log.info("analysis complete", { projectId, ms: Date.now() - t0, analyzer: pairRes.analyzer, top: opps.slice(0, 3).map((o) => `${o.recipeId}:${o.scores.overall}`) });
  } catch (e) {
    Projects.update(projectId, { status: "failed", analysisError: (e as Error).message });
    Events.track("analysis_failed", { userId: project.userId, projectId, props: { error: (e as Error).message } });
    throw e;
  }
}

function uniq(frames: ExtractedFrame[]): ExtractedFrame[] {
  const seen = new Set<string>();
  return frames.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}
