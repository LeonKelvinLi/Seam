/**
 * What to do when a generation fails or scores badly (spec §12, §28).
 * Attempt 1: chosen recipe on the best model. Quality miss -> same recipe, faithful settings, next-best model.
 * Provider error -> next model. If every take so far was rejected on quality, the final attempt switches to the
 * safest recipe for these clips (the smooth lane's pick) and says so: a working transition beats a refund.
 */
import type { FineTune, QualityScores, TransitionOpportunity } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import { passesStyle } from "./style";
import { getRecipe } from "@/core/recipes/registry";
import { recommend } from "@/core/opportunities/recommend";

/** The recipe the smooth lane would pick for these clips, when it differs from the one that keeps failing. */
export function safestAlternative(opportunities: TransitionOpportunity[], currentRecipeId: string): TransitionOpportunity | null {
  const usable = opportunities.filter((o) => o.recipeId !== currentRecipeId && o.hints?.fit !== "poor");
  if (!usable.length) return null;
  const smooth = recommend(usable).find((r) => r.lane === "smooth")?.opportunity;
  return smooth ?? usable.slice().sort((a, b) => getRecipe(a.recipeId).intensity - getRecipe(b.recipeId).intensity)[0];
}

export interface AttemptOutcome { kind: "error" | "quality"; message: string; scores: QualityScores | null; modelId: string }

export interface NextAttempt {
  recipeId: string;
  fineTune: FineTune;
  excludeModels: string[];
  reason: string;
  /** Message shown to the user while retrying. */
  userMessage: string;
  /** Set when we switched to a safer recipe. */
  suggestion: string | null;
}

export function planNextAttempt(args: {
  attempt: number; maxAttempts: number; recipe: TransitionRecipe; fineTune: FineTune;
  outcomes: AttemptOutcome[]; opportunities: TransitionOpportunity[];
}): NextAttempt | null {
  const { attempt, maxAttempts, recipe, fineTune, outcomes } = args;
  if (attempt >= maxAttempts) return null;
  const last = outcomes[outcomes.length - 1];
  const tried = outcomes.map((o) => o.modelId);
  const fidelityMiss = last.scores ? last.scores.startFidelity < 60 || last.scores.endFidelity < 60 : false;
  const artifactMiss = last.scores ? last.scores.artifacts < 60 || last.scores.subjectConsistency < 60 : false;
  const styleMiss = last.scores ? !passesStyle(last.scores) : false;
  const finalTry = attempt + 1 >= maxAttempts;
  if (finalTry && outcomes.length && outcomes.every((o) => o.kind === "quality")) {
    const safe = safestAlternative(args.opportunities, recipe.id);
    if (safe) {
      const name = getRecipe(safe.recipeId).name;
      return {
        recipeId: safe.recipeId, fineTune, excludeModels: [],
        reason: `every ${recipe.id} take was rejected; switching to ${safe.recipeId}`,
        userMessage: `${recipe.name} isn't holding up on these clips. Making ${name} instead.`,
        suggestion: `${recipe.name} didn't hold up on these clips, so Clipmelt made ${name} instead. Try another if you want to go again.`,
      };
    }
  }
  if (last.kind === "error") {
    return {
      recipeId: recipe.id, fineTune, excludeModels: tried,
      reason: `provider error: ${last.message}`,
      userMessage: "That transition didn't come out cleanly. We're trying a better approach.",
      suggestion: null,
    };
  }
  return {
    recipeId: recipe.id,
    fineTune: {
      ...fineTune,
      creativity: Math.max(0, fineTune.creativity - (fidelityMiss ? 0.3 : 0.15)),
      // A missing orbit/push/pull is not repaired by suppressing the camera move further.
      cameraMovement: styleMiss ? fineTune.cameraMovement : Math.max(0.1, fineTune.cameraMovement - (artifactMiss ? 0.25 : 0.1)),
    },
    excludeModels: artifactMiss || styleMiss ? tried : [],
    reason: `quality ${last.scores?.overall ?? "?"}: ${last.scores?.issues.join("; ") ?? ""}`,
    userMessage: styleMiss ? `That take didn't match ${recipe.name}. Trying the same style with another model.` : "That transition didn't come out cleanly. We're trying a better approach.",
    suggestion: null,
  };
}
