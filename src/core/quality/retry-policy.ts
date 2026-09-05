/**
 * What to do when a generation fails or scores badly (spec §12, §28).
 * Attempt 1: chosen recipe on the best model. Quality miss -> same recipe, faithful settings, next-best model.
 * Provider error -> next model. Final attempt -> the recipe's safer alternative (or the smoothest opportunity).
 */
import type { FineTune, QualityScores, TransitionOpportunity } from "@/core/types";
import { getRecipe } from "@/core/recipes/registry";
import type { TransitionRecipe } from "@/core/recipes/types";

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

export function saferRecipeFor(recipe: TransitionRecipe, opps: TransitionOpportunity[]): TransitionRecipe {
  if (recipe.saferAlternative) return getRecipe(recipe.saferAlternative);
  const smooth = opps.filter((o) => getRecipe(o.recipeId).intensity < recipe.intensity).sort((a, b) => b.scores.overall - a.scores.overall)[0];
  return smooth ? getRecipe(smooth.recipeId) : getRecipe("dissolve-match");
}

export function planNextAttempt(args: {
  attempt: number; maxAttempts: number; recipe: TransitionRecipe; fineTune: FineTune;
  outcomes: AttemptOutcome[]; opportunities: TransitionOpportunity[];
}): NextAttempt | null {
  const { attempt, maxAttempts, recipe, fineTune, outcomes } = args;
  if (attempt >= maxAttempts) return null;
  const last = outcomes[outcomes.length - 1];
  const tried = outcomes.map((o) => o.modelId);
  const isLast = attempt + 1 >= maxAttempts;
  const fidelityMiss = last.scores ? last.scores.startFidelity < 60 || last.scores.endFidelity < 60 : false;
  const artifactMiss = last.scores ? last.scores.artifacts < 60 || last.scores.subjectConsistency < 60 : false;
  const persistentQualityMiss = outcomes.filter((o) => o.kind === "quality").length >= 2;

  if (isLast || persistentQualityMiss) {
    const safer = saferRecipeFor(recipe, args.opportunities);
    if (safer.id !== recipe.id) {
      return {
        recipeId: safer.id,
        fineTune: { ...fineTune, creativity: Math.min(fineTune.creativity, 0.3), cameraMovement: Math.min(fineTune.cameraMovement, 0.5) },
        excludeModels: last.kind === "error" ? tried : [],
        reason: `switched to safer recipe ${safer.id}`,
        userMessage: `This footage is fighting the ${recipe.name.toLowerCase()}. Trying a ${safer.name.toLowerCase()} instead.`,
        suggestion: `This footage is fighting the ${recipe.name.toLowerCase()}. A ${safer.name.toLowerCase()} will likely look cleaner.`,
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
      cameraMovement: Math.max(0.1, fineTune.cameraMovement - (artifactMiss ? 0.25 : 0.1)),
    },
    excludeModels: artifactMiss ? tried : [],
    reason: `quality ${last.scores?.overall ?? "?"}: ${last.scores?.issues.join("; ") ?? ""}`,
    userMessage: "That transition didn't come out cleanly. We're trying a better approach.",
    suggestion: null,
  };
}
