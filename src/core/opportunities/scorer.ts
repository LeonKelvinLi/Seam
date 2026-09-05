/**
 * Turns visual understanding into ranked transition opportunities (spec §5).
 * Every recipe in the catalog is scored against the pair; requirements gate, boosts reward,
 * contraindications and footage risks raise artifact risk. Model-proposed ideas get their
 * human titles kept and a bonus, but the structured scores still decide the ranking.
 */
import type { FrameAnalysis, FrameFeatures, OpportunityScores, PairAnalysis, RelationshipKind, ShapeType, TransitionOpportunity } from "@/core/types";
import type { RecipeRequirements, TransitionRecipe } from "@/core/recipes/types";
import { RECIPES } from "@/core/recipes/registry";
import { colorSimilarity } from "@/core/analysis/features";
import { detectMotivations, motivationSupport, restraint, MOTIVATION_LABEL, type AudioContext } from "@/core/director/grammar";

export interface ScoringContext {
  a: FrameAnalysis;
  b: FrameAnalysis;
  fa: FrameFeatures;
  fb: FrameFeatures;
  pair: PairAnalysis;
  audio?: AudioContext;
}

export type OpportunityDraft = Omit<TransitionOpportunity, "id" | "projectId" | "pairAnalysisId" | "createdAt" | "rank">;

const SUBJECT_SHAPE: Partial<Record<string, ShapeType>> = { wheel: "wheel", screen: "screen", phone: "screen", drink: "cup", face: "eye" };

function words(a: FrameAnalysis): string[] {
  return [
    ...a.materials, ...a.tags, ...a.subjects.map((s) => s.label), ...a.depth.foreground, ...a.depth.middleground,
    ...a.depth.background, ...a.depth.passThroughCandidates, ...a.composition.foreground, a.composition.background,
    a.description, ...a.geometry.shapes.map((s) => s.label),
  ].map((w) => w.toLowerCase());
}

function mentions(a: FrameAnalysis, keywords: string[]): string | null {
  const ws = words(a);
  for (const k of keywords) {
    const hit = ws.find((w) => w.includes(k));
    if (hit) return k;
  }
  return null;
}

function shapesOf(a: FrameAnalysis): Map<ShapeType, { label: string; center: { x: number; y: number }; size: number }> {
  const m = new Map<ShapeType, { label: string; center: { x: number; y: number }; size: number }>();
  for (const s of a.geometry.shapes) if (!m.has(s.type) || m.get(s.type)!.size < s.size) m.set(s.type, s);
  for (const s of a.subjects) {
    const t = SUBJECT_SHAPE[s.category];
    if (t && !m.has(t)) m.set(t, { label: s.label, center: s.center, size: s.prominence });
  }
  if (a.composition.horizonY !== null && !m.has("horizon")) m.set("horizon", { label: "horizon", center: { x: 0.5, y: a.composition.horizonY }, size: 0.5 });
  return m;
}

export interface Traits {
  shapesA: Map<ShapeType, { label: string; center: { x: number; y: number }; size: number }>;
  shapesB: Map<ShapeType, { label: string; center: { x: number; y: number }; size: number }>;
  foregroundObjectA: boolean;
  depthA: boolean;
  faceA: boolean;
  faceB: boolean;
  occlusionA: boolean;
  relationships: Map<RelationshipKind, number>;
  colorSim: number;
  facesNearEdge: boolean;
  text: boolean;
  fastMotion: boolean;
  dark: boolean;
  manySubjects: boolean;
  topSubjectA: string;
  topSubjectB: string;
}

export function extractTraits(ctx: ScoringContext): Traits {
  const { a, b, fa, fb, pair } = ctx;
  const rel = new Map<RelationshipKind, number>();
  for (const r of pair.relationships) rel.set(r.kind, Math.max(rel.get(r.kind) ?? 0, r.confidence));
  const isFace = (x: FrameAnalysis) =>
    x.subjects.some((s) => s.category === "face" || (s.category === "person" && ["close-up", "extreme-close-up", "medium"].includes(x.composition.framing) && s.prominence >= 0.4));
  const prominent = (x: FrameAnalysis) => [...x.subjects].sort((p, q) => q.prominence - p.prominence)[0];
  return {
    shapesA: shapesOf(a), shapesB: shapesOf(b),
    foregroundObjectA: a.depth.foreground.length > 0 || a.composition.foreground.length > 0 || a.subjects.some((s) => s.prominence >= 0.5 && s.category !== "other"),
    depthA: a.depth.passThroughCandidates.length > 0 || (a.depth.background.length > 0 && (a.depth.foreground.length > 0 || a.depth.middleground.length > 0)) || ["wide", "aerial"].includes(a.composition.framing),
    faceA: isFace(a), faceB: isFace(b),
    occlusionA: a.occlusionOpportunity >= 0.4 || fa.uniformCoverage > 0.85,
    relationships: rel,
    colorSim: pair.colorSimilarity * 0.6 + colorSimilarity(fa, fb) * 0.4,
    facesNearEdge: a.facesNearEdge || b.facesNearEdge,
    text: a.textPresent || b.textPresent,
    fastMotion: a.motion.speed === "fast" || fa.motion > 0.5,
    dark: fa.brightness < 0.15 || fb.brightness < 0.15,
    manySubjects: a.subjects.filter((s) => s.prominence >= 0.3).length >= 4,
    topSubjectA: prominent(a)?.label ?? a.depth.foreground[0] ?? "the frame",
    topSubjectB: prominent(b)?.label ?? b.depth.foreground[0] ?? "the next shot",
  };
}

/** Fraction of requirement keys satisfied, plus the concrete matches for hint filling. */
function evaluate(req: RecipeRequirements, t: Traits, ctx: ScoringContext): { score: number; total: number; hits: Record<string, string> } {
  const hits: Record<string, string> = {};
  let total = 0, ok = 0;
  const check = (cond: boolean, key?: string, val?: string) => { total++; if (cond) { ok++; if (key && val) hits[key] = val; } };
  if (req.shapesA) { const s = req.shapesA.find((x) => t.shapesA.has(x)); check(!!s, "shapeA", s ? t.shapesA.get(s)!.label : undefined); }
  if (req.shapesB) { const s = req.shapesB.find((x) => t.shapesB.has(x)); check(!!s, "shapeB", s ? t.shapesB.get(s)!.label : undefined); }
  if (req.relationships) { const r = req.relationships.find((k) => (t.relationships.get(k) ?? 0) >= 0.35); check(!!r); }
  if (req.materialsA) { const m = mentions(ctx.a, req.materialsA); check(!!m, "materialA", m ?? undefined); }
  if (req.materialsB) { const m = mentions(ctx.b, req.materialsB); check(!!m, "materialB", m ?? undefined); }
  if (req.subjectsA) { const s = ctx.a.subjects.find((x) => req.subjectsA!.includes(x.category)); check(!!s, "objectA", s?.label); }
  if (req.subjectsB) { const s = ctx.b.subjects.find((x) => req.subjectsB!.includes(x.category)); check(!!s, "objectB", s?.label); }
  if (req.framingA) check(req.framingA.includes(ctx.a.composition.framing));
  if (req.framingB) check(req.framingB.includes(ctx.b.composition.framing));
  if (req.cameraA) check(req.cameraA.includes(ctx.a.motion.camera));
  if (req.speedA) check(req.speedA.includes(ctx.a.motion.speed));
  if (req.foregroundObjectA !== undefined) check(t.foregroundObjectA === req.foregroundObjectA);
  if (req.depthA !== undefined) check(t.depthA === req.depthA);
  if (req.faceA !== undefined) check(t.faceA === req.faceA);
  if (req.faceB !== undefined) check(t.faceB === req.faceB);
  if (req.occlusionA !== undefined) check(t.occlusionA === req.occlusionA);
  if (req.minColorSimilarity !== undefined) check(t.colorSim >= req.minColorSimilarity);
  return { score: total ? ok / total : 1, total, hits };
}

function motionScore(recipe: TransitionRecipe, ctx: ScoringContext, t: Traits): number {
  const cam = ctx.a.motion.camera, zoom = ctx.a.motion.zoom, dir = ctx.a.motion.subject;
  const pm = recipe.preferredMotion;
  let s = 65;
  if (pm === "forward") s = cam === "push-in" || cam === "fpv" || zoom === "in" || dir === "toward" ? 92 : cam === "pull-out" || zoom === "out" ? 40 : 70;
  else if (pm === "away") s = cam === "pull-out" || zoom === "out" || dir === "away" ? 92 : cam === "push-in" ? 40 : 65;
  else if (pm === "any") s = 70 + (ctx.a.motion.speed === "none" ? 0 : 10);
  else {
    const panFor: Record<string, string> = { left: "pan-left", right: "pan-right", up: "tilt-up", down: "tilt-down" };
    const opposite: Record<string, string> = { left: "right", right: "left", up: "down", down: "up" };
    if (dir === pm || cam === panFor[pm]) s = 92;
    else if (dir === opposite[pm]) s = 30;
    else s = 60;
  }
  if (recipe.contraindications.fastMotion && t.fastMotion) s = Math.min(s, 30);
  return s;
}

function directionLabel(ctx: ScoringContext): string {
  const d = ctx.a.motion.subject !== "none" ? ctx.a.motion.subject : ctx.a.motion.camera.startsWith("pan-") ? ctx.a.motion.camera.slice(4) : ctx.fa.driftX > 0.01 ? "left" : ctx.fa.driftX < -0.01 ? "right" : "the right";
  return d.startsWith("the ") ? d : `the ${d}`;
}

/** A short noun phrase for the scene, or null when the analysis is too generic to name it (heuristic mode). */
function sceneLabel(a: FrameAnalysis): string | null {
  const s = [...a.subjects].sort((p, q) => q.prominence - p.prominence)[0];
  if (s && s.category !== "other" && !GENERIC.has(s.label.toLowerCase())) return s.label;
  if (a.tags.includes("heuristic")) return null;
  if (a.composition.background && a.composition.background.length < 40 && !GENERIC.has(a.composition.background.toLowerCase())) return a.composition.background;
  return null;
}
const GENERIC = new Set(["main subject", "the frame", "the scene", "scene", "subject", "background"]);

export function fillTemplate(tpl: string, hints: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => hints[k] ?? ({ A: "the first shot", B: "the next shot", objectA: "the subject", objectB: "the next subject", shapeA: "the shape", shapeB: "the matching shape", dir: "the right", materialA: "surface", materialB: "surface" }[k] ?? k));
}

export function titleCase(s: string): string {
  const small = new Set(["the", "a", "an", "of", "to", "and", "into", "in", "on", "at", "by", "for"]);
  return s.split(" ").map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && small.has(lower)) return lower;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

export function scoreOpportunities(ctx: ScoringContext, recipes: TransitionRecipe[] = RECIPES): OpportunityDraft[] {
  const t = extractTraits(ctx);
  const ideaFor = new Map(ctx.pair.ideas.map((i) => [i.recipeId, i]));
  const drafts: OpportunityDraft[] = [];
  const hits = detectMotivations(ctx.a, ctx.b, ctx.fa, ctx.fb, ctx.pair, ctx.audio);
  const rule = restraint(hits, ctx.audio);

  for (const recipe of recipes) {
    const req = evaluate(recipe.requirements, t, ctx);
    const boost = evaluate(recipe.boosts, t, ctx);
    const idea = ideaFor.get(recipe.id);
    const labelA = sceneLabel(ctx.a), labelB = sceneLabel(ctx.b);
    const generic = !labelB || GENERIC.has(t.topSubjectA.toLowerCase());
    const hints: Record<string, string> = {
      A: labelA ?? "the first shot", B: labelB ?? "the next shot", objectA: GENERIC.has(t.topSubjectA.toLowerCase()) ? "the subject" : t.topSubjectA,
      objectB: GENERIC.has(t.topSubjectB.toLowerCase()) ? "the next subject" : t.topSubjectB, dir: directionLabel(ctx),
      materialA: ctx.a.materials[0] ?? "surface", materialB: ctx.b.materials[0] ?? "surface",
      shapeA: [...t.shapesA.values()][0]?.label ?? "the shape", shapeB: [...t.shapesB.values()][0]?.label ?? "the matching shape",
      ...boost.hits, ...req.hits,
    };

    // Semantic: relationships the recipe cares about, or the model's explicit idea.
    const relKinds = [...(recipe.requirements.relationships ?? []), ...(recipe.boosts.relationships ?? [])];
    let semantic = relKinds.length ? Math.max(0, ...relKinds.map((k) => (t.relationships.get(k) ?? 0) * 100)) : 50 + boost.score * 30;
    if (idea) semantic = Math.max(semantic, idea.confidence * 100);

    const shapeReq = [...(recipe.requirements.shapesA ?? []), ...(recipe.boosts.shapesA ?? []), ...(recipe.requirements.shapesB ?? []), ...(recipe.boosts.shapesB ?? [])];
    const shapeHit = shapeReq.some((s) => t.shapesA.has(s) || t.shapesB.has(s));
    const geometry = shapeReq.length ? (shapeHit ? 82 + Math.max(...shapeReq.map((s) => (t.shapesA.get(s)?.size ?? t.shapesB.get(s)?.size ?? 0))) * 15 : 30) : 55 + ctx.pair.visualSimilarity * 30;

    const motion = motionScore(recipe, ctx, t);
    const continuity = t.colorSim * 70 + (1 - Math.abs(ctx.fa.brightness - ctx.fb.brightness)) * 30;

    let risk = recipe.baseRisk * 100 + recipe.intensity * 8;
    const ci = recipe.contraindications;
    if (ci.facesNearBoundary && t.facesNearEdge) risk += 22;
    if (ci.text && t.text) risk += 18;
    if (ci.fastMotion && t.fastMotion) risk += 15;
    if (ci.dark && t.dark) risk += 15;
    if (ci.manySubjects && t.manySubjects) risk += 15;
    if ((recipe.modelClass === "human" || t.faceA) && recipe.intensity > 0.6) risk += 8;
    risk += ctx.pair.risks.length * 3;
    risk = Math.min(95, risk);

    let wow = recipe.wow * 100;
    if (idea) wow = wow * 0.5 + idea.wow * 100 * 0.5;

    let overall = semantic * 0.28 + geometry * 0.17 + motion * 0.15 + continuity * 0.15 + (100 - risk) * 0.25;
    if (req.total > 0) overall *= 0.35 + 0.65 * req.score; // missing hard requirements sink the recipe
    if (idea) overall += 8;

    // Transition grammar: earn the move, or step aside for a clean cut.
    const { support, by } = motivationSupport(recipe, hits);
    overall += (support - 0.5) * 20;
    if (recipe.intensity >= 0.6 && support < 0.25 && !idea) overall -= 12;
    if (recipe.intensity > rule.maxIntensity) overall -= 25;
    if (recipe.id === "hard-cut") overall = rule.preferCleanCut ? Math.max(overall, 72) : Math.min(overall, 58);
    overall = Math.max(0, Math.min(100, overall));
    if (by.length) hints.motivatedBy = by.slice(0, 2).map((h) => MOTIVATION_LABEL[h.motivation]).join(" and ");
    hints.sound = recipe.sound;

    const scores: OpportunityScores = {
      semanticMatch: Math.round(semantic), geometryMatch: Math.round(geometry), motionCompatibility: Math.round(motion),
      visualContinuity: Math.round(continuity), artifactRisk: Math.round(risk), wow: Math.round(wow), overall: Math.round(overall),
    };
    drafts.push({
      recipeId: recipe.id,
      title: idea?.title ? titleCase(idea.title) : generic ? recipe.name : titleCase(fillTemplate(recipe.titleTemplate, hints)),
      why: idea?.why ?? fillTemplate(recipe.whyTemplate, hints),
      scores,
      hints,
    });
  }
  return drafts.sort((x, y) => y.scores.overall - x.scores.overall);
}
