import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunities } from "@/core/opportunities/scorer";
import { recommend, stepIntent } from "@/core/opportunities/recommend";
import { coffee, ocean, coffeeOceanPair, feat, frame } from "./fixtures";
import { getRecipe, isOffered } from "@/core/recipes/registry";

test("coffee -> ocean ranks liquid / cup / becomes-environment ideas at the top", () => {
  const drafts = scoreOpportunities({ a: coffee, b: ocean, fa: feat(), fb: feat({ dominantColors: ["#1a6ea3", "#06263f", "#ffe8b0"], brightness: 0.55 }), pair: coffeeOceanPair });
  const top = drafts.slice(0, 5).map((d) => d.recipeId);
  assert.equal(drafts[0].recipeId, "liquid-transform");
  assert.equal(drafts[0].title, "Dive Through the Coffee");
  assert.ok(top.includes("portal-cup") || top.includes("object-becomes-environment"), `top5: ${top.join(",")}`);
  // Nothing that is not a seamless AI bridge may ever be scored, so no effect or plain cut can be recommended.
  for (const d of drafts) assert.ok(isOffered(d.recipeId), `${d.recipeId} is not a seamless transition`);
});

test("lanes are distinct and ordered by intensity", () => {
  const drafts = scoreOpportunities({ a: coffee, b: ocean, fa: feat(), fb: feat(), pair: coffeeOceanPair });
  const recs = recommend(drafts.map((d, i) => ({ ...d, id: `o${i}`, projectId: "p", pairAnalysisId: "x", rank: i, createdAt: "" })));
  const lanes = Object.fromEntries(recs.map((r) => [r.lane, r.opportunity]));
  assert.ok(lanes.smooth && lanes.cinematic && lanes.viral && lanes.surprise);
  assert.equal(lanes.insane, undefined, "the Insane lane is gone: every lane is a seamless bridge");
  assert.ok(getRecipe(lanes.smooth.recipeId).intensity <= getRecipe(lanes.viral.recipeId).intensity);
  const visible = ["smooth", "cinematic", "viral"].map((l) => lanes[l].recipeId);
  assert.equal(new Set(visible).size, 3, "three different recipes across the visible lanes");
  const wilder = stepIntent(drafts, lanes.smooth, "wilder");
  assert.ok(getRecipe(wilder.recipeId).intensity > getRecipe(lanes.smooth.recipeId).intensity);
  assert.ok(isOffered(wilder.recipeId), "stepping up stays inside the seamless set");
});

test("static, unrelated frames still get a calm seamless bridge, never a cut or a dissolve", () => {
  const a = frame({ description: "a grey wall", composition: { subjectLocation: "none", centerOfInterest: { x: 0.5, y: 0.5 }, foreground: [], background: "wall", negativeSpace: "high", horizonY: null, framing: "close-up" } });
  const b = frame({ description: "a red car in a garage", color: { dominant: ["#aa2222"], brightness: 0.4, contrast: 0.4, temperature: "warm", mood: "moody" }, composition: { subjectLocation: "left", centerOfInterest: { x: 0.2, y: 0.6 }, foreground: [], background: "garage", negativeSpace: "low", horizonY: null, framing: "close-up" } });
  const pair = { relationships: [], ideas: [], visualSimilarity: 0.2, colorSimilarity: 0.1, narrative: "", risks: [] };
  const drafts = scoreOpportunities({ a, b, fa: feat({ motion: 0, edgeDensity: 0.02, uniformCoverage: 0.9 }), fb: feat({ motion: 0, dominantColors: ["#aa2222", "#111111", "#333333"] }), pair });
  const recs = recommend(drafts.map((d, i) => ({ ...d, id: `o${i}`, projectId: "p", pairAnalysisId: "x", rank: i, createdAt: "" })));
  const smooth = recs.find((r) => r.lane === "smooth")!.opportunity;
  assert.ok(isOffered(smooth.recipeId), `${smooth.recipeId} is not a seamless transition`);
  assert.ok(getRecipe(smooth.recipeId).intensity <= 0.45, "unmotivated footage gets the calmest bridge we have");
  assert.ok(smooth.why.length > 10);
});

test("motion in clip A motivates a motion match", () => {
  const a = frame({ motion: { camera: "pan-right", subject: "right", speed: "fast", zoom: "none" }, subjects: [{ label: "car", category: "vehicle", prominence: 0.8, center: { x: 0.5, y: 0.5 } }] });
  const b = frame({ subjects: [{ label: "street", category: "landscape", prominence: 0.6, center: { x: 0.5, y: 0.5 } }] });
  const pair = { relationships: [{ kind: "motion-continue" as const, from: "car", to: "street", confidence: 0.8, note: "" }], ideas: [], visualSimilarity: 0.4, colorSimilarity: 0.5, narrative: "", risks: [] };
  const drafts = scoreOpportunities({ a, b, fa: feat({ motion: 0.7, driftX: -0.05 }), fb: feat(), pair });
  const top = drafts.slice(0, 6).map((d) => d.recipeId);
  assert.ok(top.includes("motion-match"), top.join(","));
  const match = drafts.find((d) => d.recipeId === "motion-match")!;
  assert.ok(match.hints.motivatedBy?.length, "the motion match should be motivated");
  assert.ok(match.hints.sound?.length);
});
