import { config } from "@/core/config";
import { DEFAULT_FINE_TUNE, type FineTune, type Generation, type GenerationMode, type Intent, type TransitionOpportunity } from "@/core/types";
import { getRecipe, hasRecipe } from "@/core/recipes/registry";
import { stepIntent } from "@/core/opportunities/recommend";
import { scoreOpportunities } from "@/core/opportunities/scorer";
import { Events, Frames, Generations, Learning, Opportunities, PairAnalyses, Projects, Recommendations, VisualAnalyses, insert } from "@/db/repo";
import { enqueue } from "@/core/pipeline/runner";
import { newId, now } from "@/core/ids";

export interface CreateGenerationInput {
  projectId: string;
  userId: string;
  intent?: Intent;
  opportunityId?: string;
  recipeId?: string;
  fineTune?: Partial<FineTune>;
  mode?: GenerationMode;
  from?: { generationId: string; action: "wilder" | "smoother" | "regenerate" | "another" };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function laneForIntensity(i: number): Intent {
  return i <= 0.42 ? "smooth" : i <= 0.72 ? "cinematic" : i < 0.85 ? "viral" : "insane";
}

/** A library pick may not be among the stored top opportunities; score it on demand against the stored analysis. */
export function ensureOpportunityForRecipe(projectId: string, recipeId: string): TransitionOpportunity {
  const existing = Opportunities.forProject(projectId).find((o) => o.recipeId === recipeId);
  if (existing) return existing;
  const pair = PairAnalyses.latestForProject(projectId);
  if (!pair) throw new Error("analysis missing");
  const fa = Frames.get(pair.startFrameId)!, fb = Frames.get(pair.endFrameId)!;
  const a = VisualAnalyses.forFrame(fa.id)!.data, b = VisualAnalyses.forFrame(fb.id)!.data;
  const draft = scoreOpportunities({ a, b, fa: fa.features, fb: fb.features, pair: pair.data }, [getRecipe(recipeId)])[0];
  const rank = Opportunities.forProject(projectId).length;
  return insert<TransitionOpportunity>("opportunities", { ...draft, id: newId("opp"), projectId, pairAnalysisId: pair.id, rank, createdAt: now() });
}

export function createGeneration(input: CreateGenerationInput): Generation {
  const project = Projects.get(input.projectId);
  if (!project) throw new Error("project not found");
  if (project.status !== "analyzed") throw new Error("analysis not finished");
  const opps = Opportunities.forProject(input.projectId);
  let fineTune: FineTune = { ...DEFAULT_FINE_TUNE, ...(input.fineTune ?? {}) };
  let opp: TransitionOpportunity | undefined;
  let intent: Intent | undefined = input.intent;
  let parentId: string | null = null;

  if (input.from) {
    const parent = Generations.get(input.from.generationId);
    if (!parent) throw new Error("parent generation not found");
    parentId = parent.id;
    fineTune = { ...parent.fineTune, ...(input.fineTune ?? {}) };
    const parentOpp = Opportunities.get(parent.opportunityId) ?? opps[0];
    if (input.from.action === "wilder") {
      opp = stepIntent(opps, parentOpp, "wilder");
      fineTune = { ...fineTune, intensity: clamp01(fineTune.intensity + 0.2), cameraMovement: clamp01(fineTune.cameraMovement + 0.15), creativity: clamp01(fineTune.creativity + 0.15) };
      Learning.flag(parent.id, "userMadeWilder");
    } else if (input.from.action === "smoother") {
      opp = stepIntent(opps, parentOpp, "smoother");
      fineTune = { ...fineTune, intensity: clamp01(fineTune.intensity - 0.2), cameraMovement: clamp01(fineTune.cameraMovement - 0.15), creativity: clamp01(fineTune.creativity - 0.15) };
      Learning.flag(parent.id, "userMadeSmoother");
    } else if (input.from.action === "another") {
      const used = new Set(Generations.forProject(input.projectId).map((g) => g.recipeId));
      opp = opps.find((o) => !used.has(o.recipeId)) ?? opps[0];
      Learning.flag(parent.id, "userRegenerated");
    } else {
      opp = parentOpp;
      Learning.flag(parent.id, "userRegenerated");
    }
    intent = intent ?? parent.intent;
  } else if (input.opportunityId) {
    opp = Opportunities.get(input.opportunityId);
  } else if (input.recipeId) {
    if (!hasRecipe(input.recipeId)) throw new Error("unknown recipe");
    opp = ensureOpportunityForRecipe(input.projectId, input.recipeId);
  } else if (intent) {
    const rec = Recommendations.forProject(input.projectId).find((r) => r.lane === intent);
    opp = rec ? Opportunities.get(rec.opportunityId) : undefined;
  }
  if (!opp) opp = opps[0];
  if (!opp) throw new Error("no transition opportunities");
  const recipe = getRecipe(opp.recipeId);
  intent = intent ?? laneForIntensity(recipe.intensity);

  const gen = Generations.create({
    projectId: input.projectId, opportunityId: opp.id, recipeId: opp.recipeId, intent, fineTune, mode: input.mode ?? config.generation.defaultMode,
    status: "queued", stage: "queued", stageLabel: "Getting ready", progress: 0, friendlyError: null, result: null, jobId: null, parentGenerationId: parentId,
  });
  const job = enqueue("generate", { generationId: gen.id });
  Generations.update(gen.id, { jobId: job.id });
  Events.track("transition_selected", { userId: input.userId, projectId: input.projectId, generationId: gen.id, props: { intent, recipe: opp.recipeId, via: input.from?.action ?? (input.recipeId ? "library" : input.opportunityId ? "pick" : "lane") } });
  Events.track("generation_started", { userId: input.userId, projectId: input.projectId, generationId: gen.id, props: { mode: gen.mode } });
  return { ...gen, jobId: job.id };
}
