/**
 * Zod schemas for what the vision model returns. Kept free of numeric constraints
 * (structured outputs reject them); values are clamped in normalize().
 */
import { z } from "zod";
import type { CameraMotion, Direction, FrameAnalysis, Framing, PairAnalysis, RelationshipKind, ShapeType, Speed, SubjectCategory } from "@/core/types";

export const SUBJECT_CATEGORIES = [
  "person", "face", "hand", "animal", "vehicle", "wheel", "building", "interior", "food", "drink", "product", "phone",
  "screen", "landscape", "water", "sky", "plant", "text", "object", "other",
] as const satisfies readonly SubjectCategory[];
export const SHAPE_TYPES = [
  "circle", "window", "door", "screen", "tunnel", "eye", "wheel", "plate", "cup", "mirror", "archway", "frame",
  "rectangle", "line", "horizon", "other",
] as const satisfies readonly ShapeType[];
export const CAMERA_MOTIONS = [
  "static", "pan-left", "pan-right", "tilt-up", "tilt-down", "push-in", "pull-out", "orbit", "handheld", "dolly-left",
  "dolly-right", "crane", "fpv", "unknown",
] as const satisfies readonly CameraMotion[];
export const DIRECTIONS = ["none", "left", "right", "up", "down", "toward", "away"] as const satisfies readonly Direction[];
export const SPEEDS = ["none", "slow", "medium", "fast"] as const satisfies readonly Speed[];
export const FRAMINGS = ["extreme-close-up", "close-up", "medium", "wide", "aerial"] as const satisfies readonly Framing[];
export const RELATIONSHIP_KINDS = [
  "object-transform", "move-through", "geometry-match", "motion-continue", "occlusion", "foreground-wipe", "zoom-bridge",
  "environment-transform", "color-bridge", "material-bridge",
] as const satisfies readonly RelationshipKind[];

// Compile-time completeness checks: adding a union member without listing it here fails typecheck.
type Missing<U extends string, L extends readonly string[]> = Exclude<U, L[number]>;
const _c1: Missing<SubjectCategory, typeof SUBJECT_CATEGORIES> extends never ? true : never = true;
const _c2: Missing<ShapeType, typeof SHAPE_TYPES> extends never ? true : never = true;
const _c3: Missing<CameraMotion, typeof CAMERA_MOTIONS> extends never ? true : never = true;
const _c4: Missing<RelationshipKind, typeof RELATIONSHIP_KINDS> extends never ? true : never = true;
void _c1; void _c2; void _c3; void _c4;

const Point = z.object({ x: z.number(), y: z.number() });

export const FrameAnalysisSchema = z.object({
  description: z.string(),
  subjects: z.array(z.object({ label: z.string(), category: z.enum(SUBJECT_CATEGORIES), prominence: z.number(), center: Point })),
  composition: z.object({
    subjectLocation: z.enum(["left", "center", "right", "top", "bottom", "full-frame", "none"]),
    centerOfInterest: Point,
    foreground: z.array(z.string()),
    background: z.string(),
    negativeSpace: z.enum(["low", "medium", "high"]),
    horizonY: z.number().nullable(),
    framing: z.enum(FRAMINGS),
  }),
  geometry: z.object({ shapes: z.array(z.object({ type: z.enum(SHAPE_TYPES), label: z.string(), center: Point, size: z.number() })) }),
  motion: z.object({ camera: z.enum(CAMERA_MOTIONS), subject: z.enum(DIRECTIONS), speed: z.enum(SPEEDS), zoom: z.enum(["none", "in", "out"]) }),
  depth: z.object({
    foreground: z.array(z.string()), middleground: z.array(z.string()), background: z.array(z.string()),
    passThroughCandidates: z.array(z.string()),
  }),
  color: z.object({
    dominant: z.array(z.string()), brightness: z.number(), contrast: z.number(),
    temperature: z.enum(["warm", "neutral", "cool"]), mood: z.string(),
  }),
  materials: z.array(z.string()),
  occlusionOpportunity: z.number(),
  facesNearEdge: z.boolean(),
  textPresent: z.boolean(),
  tags: z.array(z.string()),
});

export const FramesResponseSchema = z.object({ frames: z.array(FrameAnalysisSchema) });

export const PairAnalysisSchema = z.object({
  relationships: z.array(z.object({ kind: z.enum(RELATIONSHIP_KINDS), from: z.string(), to: z.string(), confidence: z.number(), note: z.string() })),
  ideas: z.array(z.object({ recipeId: z.string(), title: z.string(), why: z.string(), confidence: z.number(), wow: z.number() })),
  visualSimilarity: z.number(),
  colorSimilarity: z.number(),
  narrative: z.string(),
  risks: z.array(z.string()),
});

const c01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const pt = (p: { x: number; y: number }) => ({ x: c01(p.x), y: c01(p.y) });

export function normalizeFrame(f: z.infer<typeof FrameAnalysisSchema>): FrameAnalysis {
  return {
    ...f,
    subjects: f.subjects.slice(0, 8).map((s) => ({ ...s, prominence: c01(s.prominence), center: pt(s.center) })),
    composition: { ...f.composition, centerOfInterest: pt(f.composition.centerOfInterest), horizonY: f.composition.horizonY === null ? null : c01(f.composition.horizonY) },
    geometry: { shapes: f.geometry.shapes.slice(0, 8).map((s) => ({ ...s, center: pt(s.center), size: c01(s.size) })) },
    color: { ...f.color, brightness: c01(f.color.brightness), contrast: c01(f.color.contrast), dominant: f.color.dominant.slice(0, 5) },
    materials: f.materials.map((m) => m.toLowerCase()),
    occlusionOpportunity: c01(f.occlusionOpportunity),
    tags: f.tags.slice(0, 12).map((t) => t.toLowerCase()),
  };
}

export function normalizePair(p: z.infer<typeof PairAnalysisSchema>): PairAnalysis {
  return {
    relationships: p.relationships.slice(0, 12).map((r) => ({ ...r, confidence: c01(r.confidence) })),
    ideas: p.ideas.slice(0, 10).map((i) => ({ ...i, confidence: c01(i.confidence), wow: c01(i.wow) })),
    visualSimilarity: c01(p.visualSimilarity),
    colorSimilarity: c01(p.colorSimilarity),
    narrative: p.narrative,
    risks: p.risks.slice(0, 8),
  };
}
