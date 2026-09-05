/**
 * Transition grammar: the editorial decision system behind every recommendation.
 *
 * Principle: a transition is only used when the footage motivates it. We detect *motivations*
 * (what in the frames justifies a move), map recipes to the motivations that earn them, and
 * apply restraint: unmotivated flashy transitions are pushed down, and a clean cut is promoted
 * when nothing in the frames supports more. Audio motivations (beat, dialogue, sound effect)
 * are part of the model so the music/beat phase can feed them in without changing the scorer.
 */
import type { FrameAnalysis, FrameFeatures, PairAnalysis } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";

export type Motivation =
  | "subject-movement" | "camera-movement" | "direction-of-motion" | "zoom" | "object-passing-frame" | "body-movement"
  | "lighting-change" | "beat" | "dialogue" | "sound-effect" | "location-change" | "composition-similarity" | "shape-match" | "color-match";

export interface MotivationHit { motivation: Motivation; strength: number; note: string }

/** Optional audio/timeline context (filled in by the music phase; absent in the two-clip MVP). */
export interface AudioContext {
  dialogueAcrossCut?: boolean;
  beatAtCut?: number; // 0..1 strength of a beat/drop at the cut point
  soundEffectAvailable?: boolean;
}

export const MOTIVATION_LABEL: Record<Motivation, string> = {
  "subject-movement": "the subject is moving", "camera-movement": "the camera is already moving", "direction-of-motion": "a clear direction of motion",
  zoom: "a push or pull in the framing", "object-passing-frame": "something crossing the lens", "body-movement": "a body movement toward the cut",
  "lighting-change": "a change in light", beat: "a beat in the music", dialogue: "dialogue across the cut", "sound-effect": "a sound cue",
  "location-change": "a big change of place", "composition-similarity": "matching compositions", "shape-match": "a matching shape", "color-match": "a shared palette",
};

export function detectMotivations(a: FrameAnalysis, b: FrameAnalysis, fa: FrameFeatures, fb: FrameFeatures, pair: PairAnalysis, audio?: AudioContext): MotivationHit[] {
  const hits: MotivationHit[] = [];
  const speed = { none: 0, slow: 0.35, medium: 0.65, fast: 1 }[a.motion.speed];
  const camMoving = a.motion.camera !== "static" && a.motion.camera !== "unknown";
  if (camMoving) hits.push({ motivation: "camera-movement", strength: Math.max(0.4, speed), note: `camera ${a.motion.camera.replace("-", " ")}` });
  if (a.motion.subject !== "none") hits.push({ motivation: "subject-movement", strength: Math.max(0.4, speed), note: `subject moving ${a.motion.subject}` });
  const drift = Math.hypot(fa.driftX, fa.driftY);
  if (drift > 0.012 || a.motion.camera.startsWith("pan-") || a.motion.camera.startsWith("dolly-")) {
    hits.push({ motivation: "direction-of-motion", strength: Math.min(1, 0.4 + drift * 20 + speed * 0.3), note: fa.driftX !== 0 ? (fa.driftX > 0 ? "moving left" : "moving right") : "directional motion" });
  }
  if (a.motion.zoom !== "none" || a.motion.camera === "push-in" || a.motion.camera === "pull-out" || a.motion.subject === "toward" || a.motion.subject === "away") {
    hits.push({ motivation: "zoom", strength: 0.7, note: a.motion.zoom === "out" || a.motion.camera === "pull-out" || a.motion.subject === "away" ? "pulling out" : "pushing in" });
  }
  if (a.occlusionOpportunity >= 0.35 || fa.uniformCoverage > 0.85) hits.push({ motivation: "object-passing-frame", strength: Math.max(a.occlusionOpportunity, fa.uniformCoverage > 0.85 ? 0.6 : 0), note: "something covers the lens at the boundary" });
  if (a.subjects.some((s) => (s.category === "person" || s.category === "hand") && s.prominence >= 0.4) && speed >= 0.6) hits.push({ motivation: "body-movement", strength: speed, note: "a person is in motion" });
  const dLight = Math.abs(fa.brightness - fb.brightness);
  if (dLight > 0.3 || a.color.temperature !== b.color.temperature) hits.push({ motivation: "lighting-change", strength: Math.min(1, dLight * 1.5 + (a.color.temperature !== b.color.temperature ? 0.3 : 0)), note: "the light changes across the cut" });
  const similar = pair.visualSimilarity;
  if (similar < 0.35 && ["wide", "medium", "aerial"].includes(a.composition.framing) && ["wide", "medium", "aerial"].includes(b.composition.framing)) {
    hits.push({ motivation: "location-change", strength: 1 - similar, note: "a different place" });
  }
  const ca = a.composition.centerOfInterest, cb = b.composition.centerOfInterest;
  const centreDist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  if (similar >= 0.55 || centreDist < 0.12) hits.push({ motivation: "composition-similarity", strength: Math.max(similar, 1 - centreDist * 4), note: "the two frames line up" });
  const geo = pair.relationships.find((r) => r.kind === "geometry-match");
  const shared = a.geometry.shapes.filter((s) => b.geometry.shapes.some((t) => t.type === s.type));
  if (geo || shared.length) hits.push({ motivation: "shape-match", strength: Math.max(geo?.confidence ?? 0, shared.length ? 0.6 : 0), note: shared[0] ? `a ${shared[0].type} in both shots` : geo?.note ?? "matching geometry" });
  if (pair.colorSimilarity >= 0.5) hits.push({ motivation: "color-match", strength: pair.colorSimilarity, note: "shared colours" });
  if (audio?.beatAtCut) hits.push({ motivation: "beat", strength: audio.beatAtCut, note: "on the beat" });
  if (audio?.dialogueAcrossCut) hits.push({ motivation: "dialogue", strength: 1, note: "dialogue continues" });
  if (audio?.soundEffectAvailable) hits.push({ motivation: "sound-effect", strength: 0.5, note: "a sound cue is available" });
  return hits.sort((x, y) => y.strength - x.strength);
}

/** How strongly the footage earns this recipe (0..1). Recipes with no motivation list are neutral (0.5). */
export function motivationSupport(recipe: TransitionRecipe, hits: MotivationHit[]): { support: number; by: MotivationHit[] } {
  if (!recipe.motivations.length) return { support: 0.5, by: [] };
  const by = hits.filter((h) => recipe.motivations.includes(h.motivation));
  return { support: by.length ? Math.max(...by.map((h) => h.strength)) : 0, by };
}

export interface Restraint {
  /** True when nothing in the frames motivates a visible transition: prefer a clean cut. */
  preferCleanCut: boolean;
  /** Cap on intensity while dialogue crosses the cut (clarity over effects). */
  maxIntensity: number;
  note: string;
}

export function restraint(hits: MotivationHit[], audio?: AudioContext): Restraint {
  const strongest = hits[0]?.strength ?? 0;
  const visual = hits.filter((h) => !["beat", "dialogue", "sound-effect"].includes(h.motivation));
  const preferCleanCut = (visual[0]?.strength ?? 0) < 0.35;
  const maxIntensity = audio?.dialogueAcrossCut ? 0.4 : 1;
  const note = preferCleanCut
    ? "Nothing in these frames motivates a big move; a clean cut will read as more intentional."
    : audio?.dialogueAcrossCut ? "Dialogue crosses this cut, so clarity wins over effects." : `Strongest motivation: ${MOTIVATION_LABEL[hits[0].motivation]} (${Math.round(strongest * 100)}%).`;
  return { preferCleanCut, maxIntensity, note };
}

/** Sound design suggestion per procedural family (spec: recommended SFX / audio bridges). */
export const SOUND_FOR_KIND: Record<string, string> = {
  "whip-left": "short whoosh, soft impact on landing", "whip-right": "short whoosh, soft impact on landing", "whip-up": "rising whoosh, soft impact", "whip-down": "falling whoosh, soft impact",
  "zoom-in": "riser into a sub impact on arrival", "zoom-out": "reverse swell, air release", dissolve: "airy swell, no hit; let ambience crossfade",
  flash: "camera-flash click with a short reverb tail", spin: "spinning whoosh, low thump on stop", circle: "soft riser, gentle hit", blur: "breathy swell, room tone crossfade",
  squeeze: "tearing texture, dull impact", radial: "rushing wind riser, wide impact", pixel: "granular scatter, soft impact", cut: "none, or a single transient exactly on the cut",
};
