import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunities } from "@/core/opportunities/scorer";
import { recommend } from "@/core/opportunities/recommend";
import { fitLevel, requirementSummary } from "@/core/opportunities/fit";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { HIGGSFIELD_MODELS, buildBody } from "@/core/providers/higgsfield";
import { getRecipe } from "@/core/recipes/registry";
import { DEFAULT_FINE_TUNE } from "@/core/types";
import { coffee, ocean, coffeeOceanPair, feat } from "./fixtures";

const coffeeOcean = () => scoreOpportunities({ a: coffee, b: ocean, fa: feat(), fb: feat({ dominantColors: ["#1a6ea3", "#06263f", "#ffe8b0"], brightness: 0.55 }), pair: coffeeOceanPair });

test("an effect whose hard requirement is missing is a poor fit, with the reason in plain words", () => {
  const drafts = coffeeOcean();
  const door = drafts.find((d) => d.recipeId === "portal-door")!;
  assert.equal(door.hints.fit, "poor", "a coffee cup has no door to walk through");
  assert.match(door.hints.fitNeeds, /door or archway in the first shot/);
  const liquid = drafts.find((d) => d.recipeId === "liquid-transform")!;
  assert.notEqual(liquid.hints.fit, "poor", "coffee is a liquid, so the liquid transformation fits");
  for (const d of drafts) assert.ok(["great", "possible", "poor"].includes(d.hints.fit), `${d.recipeId} has no fit`);
});

test("lanes never offer an effect the clips cannot deliver", () => {
  const recs = recommend(coffeeOcean().map((d, i) => ({ ...d, id: `o${i}`, projectId: "p", pairAnalysisId: "x", rank: i, createdAt: "" })));
  for (const r of recs) assert.notEqual(r.opportunity.hints.fit, "poor", `${r.lane} offered ${r.opportunity.recipeId}`);
});

test("before any clips exist, the library says what footage an effect needs", () => {
  assert.equal(requirementSummary(getRecipe("portal-door").requirements), "Needs a door or archway in the first shot.");
  assert.equal(requirementSummary(getRecipe("push-through").requirements), "Works with most footage.");
  assert.equal(fitLevel(0, 1, 90), "poor", "a missing hard requirement is never rescued by other scores");
  assert.equal(fitLevel(1, 1, 75), "great");
  assert.equal(fitLevel(1, 0, 50), "possible");
});

test("Higgsfield prompts carry the seamless rules themselves and send no negative prompt", () => {
  const ir = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe: getRecipe("liquid-transform"), hints: {}, fineTune: DEFAULT_FINE_TUNE, durationSec: 1.4, aspectRatio: "16:9", attempt: 1 });
  const prompt = renderPrompt(ir, "higgsfield");
  assert.equal(prompt.negative, null, "none of the bridge models has a negative-prompt field");
  assert.match(prompt.positive, /No cuts, no flashes, no fades/);
  assert.match(prompt.positive, /never replaced by a second copy/);
  assert.match(prompt.positive, /starts exactly on the first image/);
  assert.ok(prompt.positive.length <= 1800);
  assert.ok(HIGGSFIELD_MODELS.every((m) => m.dialect === "higgsfield"));
});

test("Hailuo-02 requests send both frames and keep the prompt verbatim", () => {
  const req = { prompt: { positive: "shot", negative: null }, aspectRatio: "16:9" as const };
  const standard = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:hailuo-02-standard")!;
  assert.deepEqual(buildBody(standard, req, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: "shot", image_url: "https://cdn/a.jpg", end_image_url: "https://cdn/b.jpg", prompt_optimizer: false, duration: 6, resolution: "768P",
  });
  const pro = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:hailuo-02-pro")!;
  assert.deepEqual(buildBody(pro, req, "a", "b"), { prompt: "shot", image_url: "a", end_image_url: "b", prompt_optimizer: false });
});
