import type { CameraMotion, Direction, Framing, RelationshipKind, ShapeType, Speed, SubjectCategory } from "@/core/types";
import type { Motivation } from "@/core/director/grammar";

export type TransitionClass = "camera" | "match" | "transformation" | "portal" | "surreal";

/** Which family of video model tends to do this well (used by the router). */
export type ModelClass = "fpv" | "morph" | "human" | "environment" | "product" | "generic";

export type LibraryTag =
  | "viral" | "cinematic" | "smooth" | "insane" | "cars" | "travel" | "fashion" | "food" | "realestate" | "products" | "music";

/** Procedural approximation used for previews and when no video model is available. */
export interface LocalFallback {
  kind: "zoom-in" | "zoom-out" | "whip-left" | "whip-right" | "whip-up" | "whip-down" | "dissolve" | "flash" | "spin" | "circle" | "blur" | "squeeze" | "radial" | "pixel";
  xfade: string;
  /** Where the zoom converges: the detected shape/object, the frame's focus point, or the centre. */
  target?: "shape" | "focus" | "center";
}

export interface RecipeRequirements {
  shapesA?: ShapeType[];
  shapesB?: ShapeType[];
  relationships?: RelationshipKind[];
  materialsA?: string[];
  materialsB?: string[];
  subjectsA?: SubjectCategory[];
  subjectsB?: SubjectCategory[];
  framingA?: Framing[];
  framingB?: Framing[];
  cameraA?: CameraMotion[];
  speedA?: Speed[];
  foregroundObjectA?: boolean;
  depthA?: boolean;
  faceA?: boolean;
  faceB?: boolean;
  occlusionA?: boolean;
  minColorSimilarity?: number;
}

export interface Contraindications {
  facesNearBoundary?: boolean;
  text?: boolean;
  fastMotion?: boolean;
  dark?: boolean;
  manySubjects?: boolean;
}

export interface TransitionRecipe {
  id: string;
  name: string;
  category: TransitionClass;
  tags: LibraryTag[];
  description: string;
  /** 0 = barely noticeable, 1 = reality-breaking. Drives lane assignment. */
  intensity: number;
  /** 0..1 attention factor for short-form. */
  wow: number;
  /** Prior probability of visible artifacts, before footage-specific adjustments. */
  baseRisk: number;
  /** Without these the recipe is heavily penalised. */
  requirements: RecipeRequirements;
  /** Present → bonus. */
  boosts: RecipeRequirements;
  contraindications: Contraindications;
  preferredMotion: Direction | "forward" | "any";
  recommendedDuration: [number, number];
  /** Prompt fragments. Placeholders: {A} {B} {objectA} {objectB} {shapeA} {shapeB} {dir} {materialA} {materialB} */
  cameraBehavior: string;
  bridge: string;
  endBehavior: string;
  expectedStructure: string[];
  qualityCriteria: string[];
  riskFactors: string[];
  modelClass: ModelClass;
  saferAlternative: string | null;
  local: LocalFallback;
  titleTemplate: string;
  whyTemplate: string;
  /** Prompt strategy version for this recipe; bump when the prompt changes so learning data stays comparable. */
  promptVersion: string;
  /** What in the footage earns this recipe (transition grammar). Empty = neutral, always allowed. */
  motivations: Motivation[];
  /** Sound design suggestion for the bridge. */
  sound: string;
}
