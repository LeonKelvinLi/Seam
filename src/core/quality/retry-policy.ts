/**
 * What to do when a generation fails or scores badly (spec §12, §28).
 * Attempt 1: chosen recipe on the best model. Quality miss -> same recipe, faithful settings, next-best model.
 * Provider error -> next model. Every attempt keeps the selected recipe, including the final attempt.
 */
import type { FineTune, QualityScores, TransitionOpportunity } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import { passesStyle } from "./style";

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
