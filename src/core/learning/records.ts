/**
 * Learning system (spec §19). One anonymised record per generation, updated as the user reacts.
 * Over time this answers "which transition works best for THIS kind of footage?" and feeds the router.
 */
import { Learning } from "@/db/repo";
import type { FrameAnalysis, Generation, GenerationAttempt, QualityScores } from "@/core/types";

export function traitsOf(a: FrameAnalysis): Record<string, unknown> {
  return {
    framing: a.composition.framing,
    camera: a.motion.camera,
    speed: a.motion.speed,
    brightness: Math.round(a.color.brightness * 10) / 10,
    temperature: a.color.temperature,
    subjects: [...new Set(a.subjects.map((s) => s.category))].slice(0, 5),
    shapes: [...new Set(a.geometry.shapes.map((s) => s.type))].slice(0, 5),
    materials: a.materials.slice(0, 5),
    facesNearEdge: a.facesNearEdge,
    text: a.textPresent,
  };
}

export function recordGeneration(args: {
  generation: Generation; a: FrameAnalysis; b: FrameAnalysis; attempts: GenerationAttempt[];
  quality: QualityScores | null; promptVersion: string; durationSec: number;
}) {
  const last = args.attempts[args.attempts.length - 1];
  Learning.upsert({
    generationId: args.generation.id,
    sourceTraits: traitsOf(args.a),
    destinationTraits: traitsOf(args.b),
    recipeId: last?.recipeId ?? args.generation.recipeId,
    intent: args.generation.intent,
    providerId: last?.providerId ?? "local",
    modelId: last?.modelId ?? "local:xfade",
    promptVersion: args.promptVersion,
    params: { durationSec: args.durationSec, fineTune: args.generation.fineTune, mode: args.generation.mode },
    generationMs: args.attempts.reduce((s, x) => s + x.durationMs, 0),
    qualityOverall: args.quality?.overall ?? null,
    retryCount: Math.max(0, args.attempts.length - 1),
    recommendedLane: args.generation.intent,
    userRegenerated: false, userDownloaded: false, userShared: false, userMadeWilder: false, userMadeSmoother: false,
  });
}

/** Learned quality per model for a recipe's class, from past records (simple mean; a real system would use more). */
export function learnedModelQuality(recipeIds: string[]): Record<string, number> {
  const rows = Learning.all().filter((r) => recipeIds.includes(r.recipeId) && r.qualityOverall !== null);
  const acc = new Map<string, { s: number; n: number }>();
  for (const r of rows) {
    const e = acc.get(r.modelId) ?? { s: 0, n: 0 };
    e.s += (r.qualityOverall ?? 0) / 100; e.n++;
    acc.set(r.modelId, e);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of acc) if (v.n >= 3) out[k] = v.s / v.n;
  return out;
}
