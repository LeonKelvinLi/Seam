import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, getRecipe } from "@/core/recipes/registry";
import { STYLE_REQUIREMENTS } from "@/core/recipes/style-contract";
import { annotateStyleAssessment } from "@/core/quality/style";
import { passes } from "@/core/quality/judge";
import { selectPassingCandidate } from "@/core/quality/selection";
import { planNextAttempt, type AttemptOutcome } from "@/core/quality/retry-policy";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { DEFAULT_FINE_TUNE, type QualityScores, type TransitionOpportunity } from "@/core/types";
import { coffee, ocean, coffeeOceanPair } from "./fixtures";

const good: QualityScores = { startFidelity: 95, endFidelity: 95, subjectConsistency: 95, continuity: 95, artifacts: 95, aesthetic: 95, transitionSuccess: 95, overall: 95, issues: [], styleMatch: "matched", styleEvidence: "Frames 2-7 show the camera circling the subject with changing perspective." };

test("every offered style has a distinct observable requirement, including opposite camera moves", () => {
  for (const r of RECIPES) assert.ok(STYLE_REQUIREMENTS[r.id], `${r.id} has no defining visual behavior`);
  assert.equal(new Set(RECIPES.map(r => STYLE_REQUIREMENTS[r.id])).size, RECIPES.length);
  assert.match(STYLE_REQUIREMENTS.orbit, /viewpoint arcs around/);
  assert.match(STYLE_REQUIREMENTS["pull-out-reveal"], /pulls backward/);
  assert.match(STYLE_REQUIREMENTS["push-through"], /pushes into/);
});

test("a clean take in a different or unverified style is delivered, noted, and loses only to a style match", () => {
  for (const styleMatch of ["mismatched", "uncertain"] as const) {
    const raw = { ...good, overall: 100, transitionSuccess: 100, styleMatch, styleEvidence: "Frames 2-8 only zoom forward; no orbit or background parallax is visible." };
    assert.equal(passes(raw, "preview"), true, "style is a preference, not a delivery gate");
    const stored = annotateStyleAssessment(raw);
    assert.equal(stored.overall, 100);
    assert.match(stored.issues[0], /no orbit/);
    const accepted = { scores: good };
    assert.equal(selectPassingCandidate(accepted, { scores: raw }, "preview"), accepted, "a faithful take still wins");
    const other = { scores: raw };
    assert.equal(selectPassingCandidate(null, other, "preview"), other);
  }
  assert.equal(passes({ ...good, transitionSuccess: 40 }, "preview"), true);
  assert.equal(passes({ ...good, startFidelity: 40 }, "preview"), false, "fidelity to the clips is still a gate");
  assert.equal(passes({ ...good, seamless: false }, "preview"), false, "so is a seamless join");
});

const opp = (recipeId: string, overall: number) => ({ id: `opp_${recipeId}`, recipeId, hints: {},
  scores: { overall, artifactRisk: 10, visualContinuity: 80, wow: 50, geometryMatch: 50, motionCompatibility: 50, semanticMatch: 50 } }) as unknown as TransitionOpportunity;

test("after quality rejections the final attempt switches to the safest recipe for these clips", () => {
  const recipe = getRecipe("orbit");
  const opportunities = [opp("orbit", 90), opp("color-match", 88), opp("push-through", 70)];
  const rejected: AttemptOutcome = { kind: "quality", message: "artifacts", scores: { ...good, overall: 60, artifacts: 40 }, modelId: "model-a" };
  const errored: AttemptOutcome = { kind: "error", message: "fal 500", scores: null, modelId: "model-b" };
  const plan = (attempt: number, outcomes: AttemptOutcome[], opps = opportunities) =>
    planNextAttempt({ attempt, maxAttempts: 3, recipe, fineTune: DEFAULT_FINE_TUNE, outcomes, opportunities: opps });

  assert.equal(plan(1, [rejected])?.recipeId, "orbit", "the chosen recipe gets a second try");
  const last = plan(2, [rejected, rejected]);
  assert.equal(last?.recipeId, "color-match");
  assert.deepEqual(last?.excludeModels, [], "the safer recipe starts with every model available");
  assert.match(last?.suggestion ?? "", /Orbit Transition didn't hold up on these clips, so Clipmelt made Color Match instead/);
  assert.equal(plan(2, [rejected, errored])?.recipeId, "orbit", "provider errors are not the recipe's fault");
  assert.equal(plan(2, [rejected, rejected], [])?.recipeId, "orbit", "no alternative, no switch");
  assert.equal(plan(3, [rejected, rejected, rejected]), null);
});

test("a director-written shot cannot remove the chosen effect or truncate the no-blend rules", () => {
  const ir = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe: getRecipe("orbit"), hints: {}, fineTune: DEFAULT_FINE_TUNE, durationSec: 2, aspectRatio: "16:9", attempt: 1 });
  for (const dialect of ["plain", "higgsfield", "kling", "runway"] as const) {
    const p = renderPrompt({ ...ir, shot: "The camera pushes forward. ".repeat(200) }, dialect).positive;
    assert.match(p, /^Required effect: Orbit Transition/);
    assert.match(p, /viewpoint arcs around/);
    assert.match(p, /no dissolves, no double exposure/);
    assert.ok(p.length <= (dialect === "kling" ? 2400 : dialect === "runway" ? 1000 : 1800));
  }
});


test("director failure cannot drop the style contract or no-blend rules in any provider dialect", () => {
  for (const recipe of RECIPES) {
    const ir = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe, hints: {}, fineTune: DEFAULT_FINE_TUNE, durationSec: 2, aspectRatio: "16:9", attempt: 1 });
    for (const dialect of ["plain", "higgsfield", "kling", "runway", "generic"] as const) {
      const p = renderPrompt({ ...ir, source: ir.source.repeat(100), bridge: ir.bridge.repeat(100) }, dialect).positive;
      assert.ok(p.includes(STYLE_REQUIREMENTS[recipe.id]), `${recipe.id}/${dialect} lost its effect`);
      assert.match(p, /no dissolves, no double exposure/);
      assert.ok(p.length <= (dialect === "kling" ? 2400 : dialect === "runway" ? 1000 : 1800));
    }
  }
});


test("orbit staging does not turn its proposed occlusion into a required style feature", () => {
  const recipe = getRecipe("orbit");
  assert.doesNotMatch(recipe.expectedStructure.join(" "), /opaque|occlu|conceal/i);
  assert.doesNotMatch(STYLE_REQUIREMENTS.orbit, /opaque|occlu|conceal/i);
});
