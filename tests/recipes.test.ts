import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, getRecipe } from "@/core/recipes/registry";

const XFADE = new Set(["fade", "fadeblack", "fadewhite", "distance", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "smoothleft", "smoothright", "smoothup", "smoothdown", "circlecrop", "rectcrop", "circleclose", "circleopen", "horzclose", "horzopen", "vertclose", "vertopen", "diagbl", "diagbr", "diagtl", "diagtr", "hlslice", "hrslice", "vuslice", "vdslice", "dissolve", "pixelize", "radial", "hblur", "wipetl", "wipetr", "wipebl", "wipebr", "squeezev", "squeezeh", "zoomin", "fadefast", "fadeslow"]);

test("catalog integrity", () => {
  const ids = new Set<string>();
  for (const r of RECIPES) {
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
  for (const c of ["camera", "match", "transformation", "portal", "surreal"]) assert.ok(RECIPES.some((r) => r.category === c), `category ${c}`);
  assert.ok(RECIPES.length >= 48);
});

test("every library tag has recipes", () => {
  for (const tag of ["viral", "cinematic", "smooth", "insane", "cars", "travel", "fashion", "food", "realestate", "products", "music"]) {
    assert.ok(RECIPES.some((r) => r.tags.includes(tag as never)), `tag ${tag}`);
  }
});
