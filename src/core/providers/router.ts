/**
 * Model router (spec §11). Ranks available models for a recipe's transition class and the
 * requested mode; the local procedural model always closes the list as the safety net.
 * Learned strengths (from the learning system) can be layered on top of the seeded ones.
 */
import { config } from "@/core/config";
import type { GenerationMode } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import { availableModels } from "./registry";
import { LOCAL_MODEL } from "./local";
import type { ModelSpec } from "./types";

/**
 * The procedural ffmpeg bridge is an offline/test path, not a product transition: a crossfade is exactly
 * the "default" transition SeamCut exists to replace. It is only used when no AI bridge model is configured
 * at all (local development, CI) or when SEAM_ALLOW_PROCEDURAL is set deliberately.
 */
export function proceduralAllowed(): boolean {
  if (config.generation.allowProcedural) return true;
  return availableModels().every((m) => m.providerId === "local");
}

export interface RouteInput {
  recipe: TransitionRecipe;
  mode: GenerationMode;
  /** Model ids that already failed for this generation. */
  exclude?: string[];
  /** Learned per-model quality for this transition class (0..1), if any. */
  learned?: Record<string, number>;
}

export function routeModels(input: RouteInput): ModelSpec[] {
  const exclude = new Set(input.exclude ?? []);
  const remote = availableModels().filter((m) => m.providerId !== "local" && m.supportsLastFrame && !exclude.has(m.id));
  const maxCost = Math.max(0.01, ...remote.map((m) => m.costPerSecondUsd));
  const scored = remote.map((m) => {
    const strength = m.strengths[input.recipe.modelClass] ?? 0.5;
    const learned = input.learned?.[m.id];
    const quality = learned !== undefined ? strength * 0.5 + learned * 0.5 : strength;
    const tierFit = m.tier === "both" ? 0.8 : m.tier === input.mode ? 1 : 0.35;
    const cheap = 1 - m.costPerSecondUsd / maxCost;
    const score = quality * 0.55 + tierFit * 0.3 + cheap * (input.mode === "preview" ? 0.15 : 0.02);
    return { m, score };
  });
  const ordered = scored.sort((a, b) => b.score - a.score).map((s) => s.m);
  if (proceduralAllowed() && !exclude.has(LOCAL_MODEL.id)) ordered.push(LOCAL_MODEL);
  return ordered;
}
