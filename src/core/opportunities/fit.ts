/**
 * How well a pair of clips suits an effect, in words a user understands. The scorer already decides whether an
 * effect's hard requirements are met; this turns the unmet ones into a sentence ("Needs a door or archway in the
 * first shot.") and a level the library shows as a badge, so nobody is offered an effect their footage cannot deliver.
 */
import type { RecipeRequirements } from "@/core/recipes/types";

export type FitLevel = "great" | "possible" | "poor";

const or = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);
const and = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const RELATIONSHIP: Record<string, string> = {
  "geometry-match": "shapes that line up across the two shots",
  "motion-continue": "movement in the first shot that can carry into the second",
  "object-transform": "an object in the first shot that can become one in the second",
  "material-bridge": "a surface in the first shot that can turn into the second shot",
  "color-bridge": "a colour both shots share",
  "move-through": "something the camera can move through",
  "zoom-bridge": "a detail the camera can zoom through",
  occlusion: "something that can cover the lens",
  "foreground-wipe": "something passing close to the camera",
  "environment-transform": "surroundings that can rebuild into the second place",
};

const FRAMING: Record<string, string> = { "extreme-close-up": "extreme close-up", "close-up": "close-up", medium: "medium", wide: "wide", aerial: "aerial" };

/** One phrase per requirement key, e.g. shapesA -> "a door or archway in the first shot". */
export function requirementPhrases(req: RecipeRequirements): Partial<Record<keyof RecipeRequirements, string>> {
  const p: Partial<Record<keyof RecipeRequirements, string>> = {};
  if (req.shapesA) p.shapesA = `a ${or(req.shapesA)} in the first shot`;
  if (req.shapesB) p.shapesB = `a ${or(req.shapesB)} in the second shot`;
  if (req.relationships) p.relationships = or(req.relationships.map((k) => RELATIONSHIP[k] ?? k.replace(/-/g, " ")));
  if (req.materialsA) p.materialsA = `${or(req.materialsA.slice(0, 3))} in the first shot`;
  if (req.materialsB) p.materialsB = `${or(req.materialsB.slice(0, 3))} in the second shot`;
  if (req.subjectsA) p.subjectsA = `a ${or(req.subjectsA)} in the first shot`;
  if (req.subjectsB) p.subjectsB = `a ${or(req.subjectsB)} in the second shot`;
  if (req.framingA) p.framingA = `a ${or(req.framingA.map((f) => FRAMING[f] ?? f))} first shot`;
  if (req.framingB) p.framingB = `a ${or(req.framingB.map((f) => FRAMING[f] ?? f))} second shot`;
  if (req.cameraA) p.cameraA = "camera movement in the first clip";
  if (req.speedA) p.speedA = "motion in the first clip";
  if (req.foregroundObjectA !== undefined) p.foregroundObjectA = req.foregroundObjectA ? "a clear subject close to the camera in the first shot" : "an uncluttered first shot";
  if (req.depthA !== undefined) p.depthA = req.depthA ? "depth in the first shot, something near and something far" : "a flat first shot";
  if (req.faceA !== undefined) p.faceA = req.faceA ? "a face in the first shot" : "no face in the first shot";
  if (req.faceB !== undefined) p.faceB = req.faceB ? "a face in the second shot" : "no face in the second shot";
  if (req.occlusionA !== undefined) p.occlusionA = "something that can cover the lens in the first shot";
  if (req.minColorSimilarity !== undefined) p.minColorSimilarity = "similar colours in both shots";
  return p;
}

export function needsSentence(missing: string[]): string {
  return missing.length ? `Needs ${and(missing)}.` : "";
}

/** What an effect asks of the footage, before any clips exist. */
export function requirementSummary(req: RecipeRequirements): string {
  const phrases = Object.values(requirementPhrases(req)).filter((p): p is string => !!p);
  return phrases.length ? needsSentence(phrases) : "Works with most footage.";
}

/**
 * great: every hard requirement is met and the effect scores well. poor: hard requirements are missing, or the footage
 * scores too low for a clean result. Anything in between could work.
 */
export function fitLevel(requirementScore: number, requirementTotal: number, overall: number): FitLevel {
  if ((requirementTotal > 0 && requirementScore < 0.5) || overall < 40) return "poor";
  if ((requirementTotal === 0 || requirementScore === 1) && overall >= 60) return "great";
  return "possible";
}
