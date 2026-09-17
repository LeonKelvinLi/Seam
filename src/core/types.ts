/**
 * Seam domain model. Entities map 1:1 to SQLite tables (camelCase columns);
 * JSON-typed fields are stored as text and hydrated by the repo layer.
 */

export type AssetRole = "start" | "end";
export type AssetKind = "video" | "image";
export type Lane = "smooth" | "cinematic" | "viral" | "insane";
export type Intent = Lane | "surprise";
export type GenerationMode = "preview" | "final";
export type GenerationStatus = "queued" | "running" | "ready" | "failed";

export interface User {
  id: string;
  createdAt: string;
  email: string | null;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  credits: number;
  plan: "free" | "starter" | "pro";
  stripeCustomerId: string | null;
  updatedAt: string | null;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Purchase {
  id: string;
  userId: string;
  provider: "stripe";
  externalId: string | null;
  pack: string;
  amountCents: number;
  currency: string;
  credits: number;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  status: "draft" | "analyzing" | "analyzed" | "failed";
  /** Output frame decided from the start clip (portrait or landscape). */
  outputWidth: number | null;
  outputHeight: number | null;
  analysisError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  role: AssetRole;
  kind: AssetKind;
  originalName: string;
  mime: string;
  path: string;
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  thumbnailPath: string | null;
  /** Normalised H.264 proxy used for every downstream step. */
  proxyPath: string | null;
  createdAt: string;
}

export interface FrameFeatures {
  sharpness: number; // 0..1
  brightness: number; // 0..1
  contrast: number; // 0..1
  edgeDensity: number; // 0..1
  /** Motion energy against the previous sampled frame (0 = static). */
  motion: number;
  /** Estimated horizontal / vertical drift vs previous frame, in fraction of frame (-1..1). */
  driftX: number;
  driftY: number;
  /** How much of the frame is covered by one uniform region (occluder / wall / sky). */
  uniformCoverage: number;
  dominantColors: string[]; // hex
  /** Where edge energy concentrates (normalised 0..1). */
  focus: { x: number; y: number };
}

export interface ExtractedFrame {
  id: string;
  assetId: string;
  /** Seconds from the start of the (proxy) clip. */
  t: number;
  path: string;
  features: FrameFeatures;
  /** Boundary-selection score computed by frame-selection. */
  boundaryScore: number;
  createdAt: string;
}

/* ---------- Visual understanding (see core/analysis/schema.ts for the zod source) ---------- */

export type SubjectCategory =
  | "person" | "face" | "hand" | "animal" | "vehicle" | "wheel" | "building" | "interior"
  | "food" | "drink" | "product" | "phone" | "screen" | "landscape" | "water" | "sky"
  | "plant" | "text" | "object" | "other";

export type ShapeType =
  | "circle" | "window" | "door" | "screen" | "tunnel" | "eye" | "wheel" | "plate" | "cup"
  | "mirror" | "archway" | "frame" | "rectangle" | "line" | "horizon" | "other";

export type CameraMotion =
  | "static" | "pan-left" | "pan-right" | "tilt-up" | "tilt-down" | "push-in" | "pull-out"
  | "orbit" | "handheld" | "dolly-left" | "dolly-right" | "crane" | "fpv" | "unknown";

export type Direction = "none" | "left" | "right" | "up" | "down" | "toward" | "away";
export type Speed = "none" | "slow" | "medium" | "fast";
export type Framing = "extreme-close-up" | "close-up" | "medium" | "wide" | "aerial";

export interface FrameAnalysis {
  description: string;
  subjects: { label: string; category: SubjectCategory; prominence: number; center: { x: number; y: number } }[];
  composition: {
    subjectLocation: "left" | "center" | "right" | "top" | "bottom" | "full-frame" | "none";
    centerOfInterest: { x: number; y: number };
    foreground: string[];
    background: string;
    negativeSpace: "low" | "medium" | "high";
    horizonY: number | null;
    framing: Framing;
  };
  geometry: { shapes: { type: ShapeType; label: string; center: { x: number; y: number }; size: number }[] };
  motion: { camera: CameraMotion; subject: Direction; speed: Speed; zoom: "none" | "in" | "out" };
  depth: { foreground: string[]; middleground: string[]; background: string[]; passThroughCandidates: string[] };
  color: { dominant: string[]; brightness: number; contrast: number; temperature: "warm" | "neutral" | "cool"; mood: string };
  materials: string[]; // liquid, glass, smoke, steam, fabric, metal, fire, water, ...
  occlusionOpportunity: number;
  facesNearEdge: boolean;
  textPresent: boolean;
  tags: string[];
}

export type RelationshipKind =
  | "object-transform" | "move-through" | "geometry-match" | "motion-continue" | "occlusion"
  | "foreground-wipe" | "zoom-bridge" | "environment-transform" | "color-bridge" | "material-bridge";

export interface PairAnalysis {
  relationships: { kind: RelationshipKind; from: string; to: string; confidence: number; note: string }[];
  ideas: { recipeId: string; title: string; why: string; confidence: number; wow: number }[];
  visualSimilarity: number;
  colorSimilarity: number;
  narrative: string;
  risks: string[];
}

export interface VisualAnalysis {
  id: string;
  assetId: string;
  frameId: string;
  analyzer: "openai" | "claude" | "heuristic"; // Claude remains readable in historical records only.
  data: FrameAnalysis;
  createdAt: string;
}

export interface PairAnalysisRecord {
  id: string;
  projectId: string;
  startFrameId: string;
  endFrameId: string;
  analyzer: "openai" | "claude" | "heuristic";
  data: PairAnalysis;
  createdAt: string;
}

/* ---------- Opportunities & recommendations ---------- */

export interface OpportunityScores {
  semanticMatch: number;
  geometryMatch: number;
  motionCompatibility: number;
  visualContinuity: number;
  artifactRisk: number;
  wow: number;
  overall: number;
}

export interface TransitionOpportunity {
  id: string;
  projectId: string;
  pairAnalysisId: string;
  recipeId: string;
  /** Human name, e.g. "Dive Through the Coffee". */
  title: string;
  /** One sentence in human language. */
  why: string;
  scores: OpportunityScores;
  /** Recipe-specific hints filled from analysis (object names, directions). */
  hints: Record<string, string>;
  rank: number;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  projectId: string;
  lane: Intent;
  opportunityId: string;
  createdAt: string;
}

/* ---------- Generation ---------- */

export interface FineTune {
  intensity: number; // 0 smooth .. 1 insane
  duration: number; // 0 fast .. 1 slow
  cameraMovement: number; // 0 low .. 1 high
  creativity: number; // 0 faithful .. 1 experimental
}

export const DEFAULT_FINE_TUNE: FineTune = { intensity: 0.5, duration: 0.5, cameraMovement: 0.5, creativity: 0.4 };

export interface GenerationResult {
  bridgePath: string;
  fullPath: string;
  posterPath: string;
  bridgeDurationSec: number;
  fullDurationSec: number;
  /** Where clip A was cut and clip B resumed, in proxy seconds. */
  cutA: number;
  cutB: number;
  providerId: string;
  modelId: string;
  quality: QualityScores | null;
  attempts: number;
  /** True when a real model failed and the procedural bridge was used instead. */
  fellBackToLocal: boolean;
  /** Friendly suggestion shown when the footage fought the chosen recipe. */
  suggestion: string | null;
}

export interface Generation {
  id: string;
  projectId: string;
  opportunityId: string;
  recipeId: string;
  intent: Intent;
  fineTune: FineTune;
  mode: GenerationMode;
  status: GenerationStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  friendlyError: string | null;
  result: GenerationResult | null;
  jobId: string | null;
  parentGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptIR {
  version: string;
  source: string;
  destination: string;
  transition: string;
  continuity: string;
  camera: string;
  bridge: string;
  end: string;
  preserve: string;
  avoid: string[];
  durationSec: number;
  aspectRatio: string;
  motionStrength: number;
  creativity: number;
  /** A shot written for this pair by the bridge director (prompt/director.ts). When present it replaces the recipe template. */
  shot?: string;
  /** Defining visual behavior that a written shot cannot replace. */
  styleRequirement?: string;
}

export interface GenerationAttempt {
  id: string;
  generationId: string;
  n: number;
  recipeId: string;
  providerId: string;
  modelId: string;
  promptIR: PromptIR;
  compiledPrompt: { positive: string; negative: string | null };
  params: Record<string, unknown>;
  status: "running" | "succeeded" | "failed" | "rejected";
  providerJobId: string | null;
  outputPath: string | null;
  error: string | null;
  costUsd: number;
  durationMs: number;
  createdAt: string;
}

export interface QualityScores {
  startFidelity: number;
  endFidelity: number;
  subjectConsistency: number;
  continuity: number;
  artifacts: number; // higher = cleaner
  aesthetic: number;
  transitionSuccess: number;
  overall: number;
  issues: string[];
  /** Set by the pixel check (quality/seamless.ts): false means a cross-dissolve or a hard cut; absent means not checked. */
  seamless?: boolean;
  /** Vision assessment; omitted on historical rows and procedural diagnostics. */
  styleMatch?: "matched" | "mismatched" | "uncertain";
  styleEvidence?: string;
}

export interface QualityEvaluation {
  id: string;
  attemptId: string;
  /** "unavailable": no vision judge answered, so the take was refused on principle (quality/judge.ts). */
  judge: "openai" | "claude" | "heuristic" | "unavailable";
  scores: QualityScores;
  passed: boolean;
  createdAt: string;
}

export interface Export {
  id: string;
  generationId: string;
  kind: "full" | "bridge";
  path: string;
  createdAt: string;
}

export interface Share {
  id: string;
  generationId: string;
  views: number;
  createdAt: string;
}

/* ---------- Jobs, learning, cost, events ---------- */

export type JobType = "analyze" | "generate";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LearningRecord {
  id: string;
  generationId: string;
  sourceTraits: Record<string, unknown>;
  destinationTraits: Record<string, unknown>;
  recipeId: string;
  intent: Intent;
  providerId: string;
  modelId: string;
  promptVersion: string;
  params: Record<string, unknown>;
  generationMs: number;
  qualityOverall: number | null;
  retryCount: number;
  recommendedLane: Intent | null;
  userRegenerated: boolean;
  userDownloaded: boolean;
  userShared: boolean;
  userMadeWilder: boolean;
  userMadeSmoother: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CostEntry {
  id: string;
  attemptId: string | null;
  generationId: string | null;
  kind: "generation" | "analysis" | "judge";
  providerId: string;
  modelId: string;
  units: number; // seconds of video or tokens
  usd: number;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  userId: string | null;
  projectId: string | null;
  generationId: string | null;
  name: string;
  props: Record<string, unknown>;
  createdAt: string;
}
