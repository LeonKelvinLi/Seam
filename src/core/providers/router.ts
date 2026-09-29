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
import type { ModelStats } from "@/db/repo";

/** Prior acceptance rate and pseudo-count used until a model has real judged attempts behind it. */
const PRIOR_ACCEPT = 0.6;
const PRIOR_N = 3;
/** Models are judged after a short clip; expected wait and spend scale with how often the judge accepts them. */
export function expectedProfile(m: ModelSpec, stats?: ModelStats) {
  const n = stats?.judged ?? 0;
  const acceptance = (( stats?.accepted ?? 0) + PRIOR_ACCEPT * PRIOR_N) / (n + PRIOR_N);
  const latencySec = n >= PRIOR_N && stats ? stats.latencySec : m.latencyEstimateSec;
  const clipSec = m.durations[0] ?? 5;
  return { acceptance, expectedWaitSec: latencySec / acceptance, expectedCostUsd: (clipSec * m.costPerSecondUsd) / acceptance, judged: n, measuredQuality: stats?.quality ?? null };
}

/**
 * The procedural ffmpeg bridge is an offline/test path, not a product transition: a crossfade is exactly
 * the "default" transition Clipmelt exists to replace. It is only used when no AI bridge model is configured
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
  /** Last chance on a pair the cheap models could not bridge: rank by ability alone, ignoring tier and price. */
  best?: boolean;
  /** Measured acceptance, quality and wall time per model id (Attempts.modelStats()). */
  measured?: Record<string, ModelStats>;
}

export function routeModels(input: RouteInput): ModelSpec[] {
  const exclude = new Set(input.exclude ?? []);
  const only = config.providers.forceModel;
  const remote = availableModels().filter((m) => m.providerId !== "local" && m.supportsLastFrame && !exclude.has(m.id) && (!only || m.id === only));
  const profiles = new Map(remote.map((m) => [m.id, expectedProfile(m, input.measured?.[m.id])]));
  const maxWait = Math.max(1, ...remote.map((m) => profiles.get(m.id)!.expectedWaitSec));
  const maxCost = Math.max(0.01, ...remote.map((m) => profiles.get(m.id)!.expectedCostUsd));
  const scored = remote.map((m) => {
    const p = profiles.get(m.id)!;
    const strength = m.strengths[input.recipe.modelClass] ?? 0.5;
    // Seeded strength gives way to measured judge scores as attempts accumulate; per-recipe learning refines it further.
    const measured = p.measuredQuality !== null ? strength * (PRIOR_N / (p.judged + PRIOR_N)) + (p.measuredQuality / 100) * (p.judged / (p.judged + PRIOR_N)) : strength;
    const learned = input.learned?.[m.id];
    const quality = learned !== undefined ? measured * 0.5 + learned * 0.5 : measured;
    const tierFit = m.tier === "both" ? 0.8 : m.tier === input.mode ? 1 : 0.5;
    const speed = 1 - p.expectedWaitSec / maxWait;
    const cheap = 1 - p.expectedCostUsd / maxCost;
    // Previews are what people wait for: expected time-to-accept weighs as much as quality. Finals rank on quality.
    const score = input.best ? quality
      : input.mode === "preview" ? quality * 0.4 + speed * 0.4 + cheap * 0.2
      : quality * 0.5 + tierFit * 0.25 + speed * 0.15 + cheap * 0.1;
    return { m, score };
  });
  const ranked = scored.sort((a, b) => b.score - a.score).map((s) => s.m);
  // Leon's pick (2026-09-29, "cant we just use higgsfield api"): the preferred provider's models go first.
  const prefer = config.providers.prefer;
  const ordered = prefer ? [...ranked.filter((m) => m.providerId === prefer), ...ranked.filter((m) => m.providerId !== prefer)] : ranked;
  if (proceduralAllowed() && !exclude.has(LOCAL_MODEL.id)) ordered.push(LOCAL_MODEL);
  return ordered;
}
