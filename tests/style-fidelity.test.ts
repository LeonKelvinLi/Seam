import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, getRecipe } from "@/core/recipes/registry";
import { STYLE_REQUIREMENTS } from "@/core/recipes/style-contract";
import { enforceStyleAssessment } from "@/core/quality/style";
import { passes } from "@/core/quality/judge";
import { selectPassingCandidate } from "@/core/quality/selection";
import { planNextAttempt, type AttemptOutcome } from "@/core/quality/retry-policy";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { DEFAULT_FINE_TUNE, type QualityScores } from "@/core/types";
import { coffee, ocean, coffeeOceanPair } from "./fixtures";

const good: QualityScores = { startFidelity: 95, endFidelity: 95, subjectConsistency: 95, continuity: 95, artifacts: 95, aesthetic: 95, transitionSuccess: 95, overall: 95, issues: [], styleMatch: "matched", styleEvidence: "Frames 2-7 show the camera circling the subject with changing perspective." };

test("every offered style has a distinct observable requirement, including opposite camera moves", () => {
  for (const r of RECIPES) assert.ok(STYLE_REQUIREMENTS[r.id], `${r.id} has no defining visual behavior`);
  assert.equal(new Set(RECIPES.map(r => STYLE_REQUIREMENTS[r.id])).size, RECIPES.length);
  assert.match(STYLE_REQUIREMENTS.orbit, /viewpoint arcs around/);
  assert.match(STYLE_REQUIREMENTS["pull-out-reveal"], /pulls backward/);
  assert.match(STYLE_REQUIREMENTS["push-through"], /pushes into/);
});

test("a beautiful wrong or unverified style cannot be accepted or beat a faithful result", () => {
  for (const styleMatch of ["mismatched", "uncertain"] as const) {
    const raw = { ...good, overall: 100, transitionSuccess: 100, styleMatch, styleEvidence: "Frames 2-8 only zoom forward; no orbit or background parallax is visible." };
    assert.equal(passes(raw, "preview"), false);
    const stored = enforceStyleAssessment(raw);
    assert.ok(stored.overall < 60 && stored.transitionSuccess < 50);
    assert.match(stored.issues[0], /no orbit/);
    const accepted = { scores: good };
    assert.equal(selectPassingCandidate(accepted, { scores: raw }, "preview"), accepted);
    assert.equal(selectPassingCandidate(null, { scores: raw }, "preview"), null);
  }
  assert.equal(passes({ ...good, transitionSuccess: 79 }, "preview"), false, "the style score is an independent gate");
  assert.equal(passes(good, "preview"), true);
});

test("provider and quality retries keep the selected style through the final attempt", () => {
  for (const recipe of RECIPES) {
    for (const kind of ["quality", "error"] as const) {
      const failed: AttemptOutcome = { kind, message: "wrong effect", scores: kind === "quality" ? { ...good, styleMatch: "mismatched", transitionSuccess: 30 } : null, modelId: "model-a" };
      for (const attempt of [1, 2]) {
        const next = planNextAttempt({ attempt, maxAttempts: 3, recipe, fineTune: DEFAULT_FINE_TUNE, outcomes: Array.from({ length: attempt }, () => failed), opportunities: [] });
        assert.equal(next?.recipeId, recipe.id);
        assert.equal(next?.suggestion, null);
        if (kind === "quality") assert.equal(next?.fineTune.cameraMovement, DEFAULT_FINE_TUNE.cameraMovement);
      }
      assert.equal(planNextAttempt({ attempt: 3, maxAttempts: 3, recipe, fineTune: DEFAULT_FINE_TUNE, outcomes: [failed], opportunities: [] }), null);
    }
  }
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
