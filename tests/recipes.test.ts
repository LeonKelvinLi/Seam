import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_RECIPES, LIBRARY_CATEGORIES, RECIPES, SEAMLESS_RECIPE_IDS, getRecipe, isOffered } from "@/core/recipes/registry";

const XFADE = new Set(["fade", "fadeblack", "fadewhite", "distance", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "smoothleft", "smoothright", "smoothup", "smoothdown", "circlecrop", "rectcrop", "circleclose", "circleopen", "horzclose", "horzopen", "vertclose", "vertopen", "diagbl", "diagbr", "diagtl", "diagtr", "hlslice", "hrslice", "vuslice", "vdslice", "dissolve", "pixelize", "radial", "hblur", "wipetl", "wipetr", "wipebl", "wipebr", "squeezev", "squeezeh", "zoomin", "fadefast", "fadeslow"]);

test("catalog integrity", () => {
  const ids = new Set<string>();
  for (const r of ALL_RECIPES) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(XFADE.has(r.local.xfade), `${r.id}: unknown xfade ${r.local.xfade}`);
    assert.ok(r.recommendedDuration[0] > 0 && r.recommendedDuration[1] >= r.recommendedDuration[0], `${r.id}: duration`);
    assert.ok(r.intensity >= 0 && r.intensity <= 1 && r.wow >= 0 && r.wow <= 1 && r.baseRisk >= 0 && r.baseRisk <= 1, `${r.id}: ranges`);
    if (r.saferAlternative) { const s = getRecipe(r.saferAlternative); assert.ok(s.intensity <= r.intensity, `${r.id}: safer alternative ${s.id} is not calmer`); }
    assert.ok(r.bridge.length > 20 && r.titleTemplate.length > 3 && r.whyTemplate.length > 10, `${r.id}: copy`);
    assert.ok(typeof r.sound === "string" && r.sound.length > 0, `${r.id}: sound`);
    assert.ok(Array.isArray(r.motivations), `${r.id}: motivations`);
  }
  for (const c of ["camera", "match", "transformation", "portal", "surreal"]) assert.ok(ALL_RECIPES.some((r) => r.category === c), `category ${c}`);
  assert.ok(ALL_RECIPES.length >= 48);
});

test("only seamless transitions are offered", () => {
  assert.ok(RECIPES.length >= 20, `too few seamless recipes offered: ${RECIPES.length}`);
  for (const r of RECIPES) assert.ok(SEAMLESS_RECIPE_IDS.has(r.id), `${r.id} is offered but missing from the seamless list`);
  // Effect moves and the plain cut/dissolve stay in the catalog so old generations resolve, but are never offered.
  for (const id of ["crash-zoom", "camera-spin", "whip-pan", "tunnel-rush", "drone-dive", "fpv-fly-through", "scene-explosion", "reality-tear", "dissolve-match", "hard-cut"]) {
    assert.ok(ALL_RECIPES.some((r) => r.id === id), `${id} must stay in the catalog`);
    assert.ok(!isOffered(id), `${id} must not be offered: it is an effect or a default cut`);
  }
  for (const c of ["camera", "match", "transformation", "portal"]) assert.ok(RECIPES.some((r) => r.category === c), `category ${c}`);
});

test("every library tag has offered recipes", () => {
  for (const c of LIBRARY_CATEGORIES) assert.ok(RECIPES.some((r) => r.tags.includes(c.tag)), `tag ${c.tag}`);
});
