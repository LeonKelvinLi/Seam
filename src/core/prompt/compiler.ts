/**
 * Prompt compiler (spec §9). Visual analysis + recipe + user intent -> PromptIR (model-agnostic),
 * then PromptIR -> provider dialect. Model-specific wording lives ONLY in render().
 */
import type { FineTune, FrameAnalysis, PairAnalysis, PromptIR } from "@/core/types";
import type { TransitionRecipe } from "@/core/recipes/types";
import { fillTemplate } from "@/core/opportunities/scorer";

export const PROMPT_COMPILER_VERSION = "1.0";

/** "plain" is one plain-language paragraph with the rules written in, for models that take no negative prompt. */
export type PromptDialect = "kling" | "runway" | "higgsfield" | "plain" | "generic";

export interface CompileInput {
  a: FrameAnalysis;
  b: FrameAnalysis;
  pair: PairAnalysis;
  recipe: TransitionRecipe;
  hints: Record<string, string>;
  fineTune: FineTune;
  durationSec: number;
  aspectRatio: string;
  /** 1-based attempt number; later attempts push harder on fidelity. */
  attempt: number;
}

const BASE_AVOID = [
  "extra hands", "extra limbs", "duplicated objects", "warped faces", "distorted fingers", "text", "watermarks", "subtitles",
  "sudden cuts", "flicker", "inconsistent perspective", "morphing artifacts on people", "blurry mush",
  "cross-dissolve", "double exposure", "split screen",
];

const CRAFT = "Smooth, steady, cinematic camera motion with natural motion blur.";
const NO_BLEND = "No cuts, no flashes, no fades, no dissolves, no double exposure, no split screen. Only one of each object is ever on screen: things transform, they are never replaced by a second copy.";

function describe(a: FrameAnalysis): string {
  const subj = [...a.subjects].sort((p, q) => q.prominence - p.prominence).slice(0, 2).map((s) => s.label).join(" and ");
  const parts = [a.description];
  if (subj) parts.push(`main subject: ${subj}`);
  if (a.composition.framing) parts.push(`${a.composition.framing} framing`);
  if (a.color.mood) parts.push(`${a.color.temperature} ${a.color.mood} light`);
  return parts.join("; ");
}

export function compileIR(input: CompileInput): PromptIR {
  const { a, b, recipe, hints, fineTune, attempt } = input;
  const h = { ...hints, A: hints.A ?? "the first scene", B: hints.B ?? "the second scene" };
  const motionWords = fineTune.cameraMovement > 0.7 ? "fast, bold" : fineTune.cameraMovement < 0.3 ? "slow, restrained" : "confident";
  const creative = fineTune.creativity > 0.7 ? "allow surreal, dreamlike transformation" : fineTune.creativity < 0.3 ? "stay strictly photoreal and physically plausible" : "photoreal, with one clear impossible moment";
  const continuity = [
    a.motion.camera !== "static" && a.motion.camera !== "unknown" ? `continue the ${a.motion.camera.replace("-", " ")} camera motion of the source` : "start from a still camera and ease into the move",
    a.motion.subject !== "none" ? `keep subject motion toward the ${a.motion.subject}` : null,
    `match the ${a.color.temperature} colour temperature at the start and the ${b.color.temperature} temperature at the end`,
  ].filter(Boolean).join("; ");

  const fidelity = attempt > 1
    ? " The first frame must be identical to the source frame and the final frame identical to the destination frame; keep all people and products exactly as they appear."
    : "";

  return {
    version: `${PROMPT_COMPILER_VERSION}/${recipe.id}@${recipe.promptVersion}`,
    source: describe(a),
    destination: describe(b),
    transition: `${recipe.name}: ${fillTemplate(recipe.description, h)}`,
    continuity,
    camera: `${motionWords} ${fillTemplate(recipe.cameraBehavior, h)}`,
    bridge: fillTemplate(recipe.bridge, h) + fidelity,
    end: fillTemplate(recipe.endBehavior, h),
    preserve: [
      "lighting direction", "general colour temperature", "identity and proportions of any person", "the exact appearance of products and text-free surfaces",
      creative,
    ].join(", "),
    // The pair's risks are whole sentences; they belong to the director, not to a negative prompt of short phrases.
    avoid: [...BASE_AVOID, ...recipe.riskFactors],
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    motionStrength: Math.round((0.3 + fineTune.cameraMovement * 0.6) * 100) / 100,
    creativity: fineTune.creativity,
  };
}

/** Render the IR into the wording a specific model family responds to best. */
export function renderPrompt(ir: PromptIR, dialect: PromptDialect): { positive: string; negative: string | null } {
  if (ir.shot) {
    // A written shot names the real objects and the one motivated change; video models follow that far better than the
    // recipe template, which reads the same for every pair.
    const positive = `${ir.shot} ${CRAFT} ${NO_BLEND}`;
    return dialect === "kling"
      ? { positive: positive.slice(0, 2400), negative: ir.avoid.join(", ").slice(0, 500) }
      : { positive: positive.slice(0, 1800), negative: null };
  }
  switch (dialect) {
    case "kling": {
      // Kling likes one dense paragraph: subject, motion, camera, then constraints. Negative prompt is a separate field.
      const positive =
        `Continuous single shot, no cuts. Starts exactly on: ${ir.source}. ` +
        `Camera: ${ir.camera}. ${ir.bridge}. ${ir.end}. Ends exactly on: ${ir.destination}. ` +
        `${ir.continuity}. Preserve ${ir.preserve}. Cinematic, photoreal, smooth motion, high detail.`;
      return { positive: positive.slice(0, 2400), negative: ir.avoid.join(", ").slice(0, 500) };
    }
    case "higgsfield":
    case "plain": {
      // Higgsfield's bridge models (DoP, Veo 3.1, Hailuo-02) take one plain-language prompt and have no negative field,
      // so the rules that keep a bridge invisible are written into the prompt itself.
      const sentence = (s: string) => { const t = s.trim().replace(/[.\s]+$/, ""); return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : ""; };
      const positive = [
        sentence(ir.camera), sentence(ir.bridge), sentence(ir.end),
        `One continuous shot that starts exactly on the first image (${ir.source}) and lands exactly on the last image (${ir.destination}).`,
        NO_BLEND,
        sentence(ir.continuity), sentence(`keep ${ir.preserve}`), sentence(`avoid ${ir.avoid.slice(0, 10).join(", ")}`),
      ].filter(Boolean).join(" ");
      return { positive: positive.slice(0, 1800), negative: null };
    }
    case "runway": {
      // Runway prefers positive, plain camera language and short prompts; negatives are ignored.
      const positive =
        `${ir.camera}. ${ir.bridge}. ${ir.end}. One continuous take with smooth motion, ` +
        `starting on the first image and ending on the last image; ${ir.continuity}.`;
      return { positive: positive.slice(0, 1000), negative: null };
    }
    default: {
      const positive = [
        `SOURCE: ${ir.source}`, `DESTINATION: ${ir.destination}`, `TRANSITION: ${ir.transition}`, `CONTINUITY: ${ir.continuity}`,
        `CAMERA: ${ir.camera}`, `BRIDGE: ${ir.bridge}`, `END: ${ir.end}`, `PRESERVE: ${ir.preserve}`, `DURATION: ${ir.durationSec}s`,
      ].join("\n");
      return { positive, negative: `AVOID: ${ir.avoid.join(", ")}` };
    }
  }
}
