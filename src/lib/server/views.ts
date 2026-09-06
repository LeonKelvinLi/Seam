/**
 * API view models. Everything the browser sees goes through here so internal paths, raw scores
 * and provider details never leak by accident.
 */
import { config, describeRuntime } from "@/core/config";
import { mediaUrl } from "@/core/media/storage";
import { getRecipe, publicRecipe } from "@/core/recipes/registry";
import { LANE_COPY, LANE_ORDER } from "@/core/opportunities/recommend";
import { allModels } from "@/core/providers/registry";
import { find, Assets, Frames, Generations, Opportunities, PairAnalyses, Projects, Recommendations, Users } from "@/db/repo";
import type { Asset, Generation, Job, TransitionOpportunity } from "@/core/types";

export function assetView(a: Asset | undefined) {
  if (!a) return null;
  return {
    id: a.id, role: a.role, kind: a.kind, originalName: a.originalName, durationSec: a.durationSec, width: a.width, height: a.height,
    thumbnailUrl: mediaUrl(a.thumbnailPath), previewUrl: mediaUrl(a.proxyPath ?? (a.kind === "image" ? a.path : null)) ?? mediaUrl(a.path),
  };
}

export function opportunityView(o: TransitionOpportunity) {
  const r = getRecipe(o.recipeId);
  return {
    id: o.id, recipeId: o.recipeId, title: o.title, why: o.why, recipe: publicRecipe(r), intensity: r.intensity, wow: o.scores.wow, overall: o.scores.overall,
    motivatedBy: o.hints.motivatedBy ?? null, sound: o.hints.sound ?? r.sound,
  };
}

export function generationView(g: Generation) {
  const r = getRecipe(g.recipeId);
  const opp = Opportunities.get(g.opportunityId);
  const model = g.result ? allModels().find((m) => m.id === g.result!.modelId) : null;
  return {
    id: g.id, projectId: g.projectId, recipeId: g.recipeId, recipe: publicRecipe(r), intent: g.intent, status: g.status, stage: g.stage,
    stageLabel: g.stageLabel, progress: g.progress, friendlyError: g.friendlyError, fineTune: g.fineTune, mode: g.mode,
    title: opp?.title ?? r.name, why: opp?.why ?? r.description, parentGenerationId: g.parentGenerationId, createdAt: g.createdAt,
    motivatedBy: opp?.hints.motivatedBy ?? null, sound: opp?.hints.sound ?? r.sound,
    result: g.result ? {
      fullUrl: mediaUrl(g.result.fullPath), bridgeUrl: mediaUrl(g.result.bridgePath), posterUrl: mediaUrl(g.result.posterPath),
      bridgeDurationSec: g.result.bridgeDurationSec, fullDurationSec: g.result.fullDurationSec, cutA: g.result.cutA, cutB: g.result.cutB,
      providerId: g.result.providerId, modelLabel: model?.label ?? g.result.modelId, quality: g.result.quality ? { overall: g.result.quality.overall, issues: g.result.quality.issues } : null,
      attempts: g.result.attempts, fellBackToLocal: g.result.fellBackToLocal, isPreviewTier: g.result.providerId === "local", suggestion: g.result.suggestion,
    } : null,
  };
}

export function latestAnalyzeJob(projectId: string): Job | undefined {
  return find<Job>("jobs", "type='analyze' AND json_extract(payload,'$.projectId')=?", [projectId], "createdAt DESC", 1)[0];
}

export function projectView(projectId: string) {
  const project = Projects.get(projectId);
  if (!project) return null;
  const start = Assets.byRole(projectId, "start"), end = Assets.byRole(projectId, "end");
  const job = latestAnalyzeJob(projectId);
  const pair = PairAnalyses.latestForProject(projectId);
  const fa = pair ? Frames.get(pair.startFrameId) : undefined, fb = pair ? Frames.get(pair.endFrameId) : undefined;
  const opps = Opportunities.forProject(projectId);
  const recs = Recommendations.forProject(projectId);
  const oppById = new Map(opps.map((o) => [o.id, o]));
  const analysisStatus = project.status === "analyzed" ? "done" : project.status === "failed" ? "failed" : job && (job.status === "queued" || job.status === "running") ? "running" : "idle";
  return {
    project: { id: project.id, title: project.title, status: project.status, analysisError: project.analysisError, outputWidth: project.outputWidth, outputHeight: project.outputHeight, createdAt: project.createdAt },
    assets: { start: assetView(start), end: assetView(end) },
    analysis: { status: analysisStatus, stageLabel: job?.stageLabel ?? "", progress: job?.progress ?? 0 },
    boundary: pair && fa && fb ? { startFrameUrl: mediaUrl(fa.path), endFrameUrl: mediaUrl(fb.path), cutA: fa.t, cutB: fb.t, analyzer: pair.analyzer, narrative: pair.data.narrative } : null,
    recommendations: LANE_ORDER.map((lane) => {
      const r = recs.find((x) => x.lane === lane);
      const o = r ? oppById.get(r.opportunityId) : undefined;
      return o ? { lane, ...LANE_COPY[lane], opportunity: opportunityView(o) } : null;
    }).filter(Boolean),
    opportunities: opps.slice(0, 12).map(opportunityView),
    generations: Generations.forProject(projectId).map(generationView),
    runtime: { ...describeRuntime(), defaultMode: config.generation.defaultMode },
    credits: Users.get(project.userId)?.credits ?? 0,
  };
}

export type ProjectView = NonNullable<ReturnType<typeof projectView>>;
export type GenerationView = ReturnType<typeof generationView>;
export type OpportunityView = ReturnType<typeof opportunityView>;
