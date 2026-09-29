import test from "node:test";
import assert from "node:assert/strict";
import { config } from "@/core/config";
import { getRecipe } from "@/core/recipes/registry";
import { PROVIDERS } from "@/core/providers/registry";
import { routeModels, expectedProfile } from "@/core/providers/router";
import { HIGGSFIELD_MODELS } from "@/core/providers/higgsfield";
import { firstPassing } from "@/core/pipeline/race";

// Production figures from 2026-09-08 to 09-16: DoP Lite judged 7 times, accepted 3, mean 72, ~257 s; Kling accepted once at 84 in ~100 s.
const measured = {
  "higgsfield:dop-lite": { judged: 7, accepted: 3, quality: 71.6, latencySec: 257 },
  "higgsfield:dop-standard": { judged: 1, accepted: 0, quality: 52, latencySec: 387 },
  "fal:kling-2.1-pro": { judged: 1, accepted: 1, quality: 84, latencySec: 102 },
};

test("preview routing puts the quick, strong model first and measurements still order the older ones", (t) => {
  const originalForce = config.providers.force;
  config.providers.force = "";
  t.after(() => { config.providers.force = originalForce; });
  for (const provider of PROVIDERS) t.mock.method(provider, "isAvailable", () => true);
  const ids = routeModels({ recipe: getRecipe("dissolve-match"), mode: "preview", measured }).map((m) => m.id);
  // The 2026-09-16 model comparison: H3 Max answers in seconds, Wan 3.0 Prime made the best morph.
  assert.equal(ids[0], "fal:minimax-h3-max", `H3 Max should lead previews, got ${ids.join(" > ")}`);
  assert.equal(ids[1], "fal:wan-3.0-prime", `Wan 3.0 Prime should follow, got ${ids.join(" > ")}`);
  assert.ok(ids.indexOf("higgsfield:dop-lite") < ids.indexOf("higgsfield:dop-standard"), "the slow, rejected DoP Standard ranks below DoP Lite");
  for (const old of ["higgsfield:dop-lite", "higgsfield:dop-standard"]) assert.ok(ids.indexOf(old) > ids.indexOf("fal:kling-o3-pro"), `${old} ranks below the new models`);
  // Finals rank on quality, and the last chance on a hard pair goes to the strongest morph.
  const finals = routeModels({ recipe: getRecipe("dissolve-match"), mode: "final", measured }).map((m) => m.id);
  assert.deepEqual(finals.slice(0, 3).sort(), ["fal:kling-o3-pro", "fal:minimax-h3-max", "fal:wan-3.0-prime"]);
  const best = routeModels({ recipe: getRecipe("liquid-transform"), mode: "preview", measured, best: true }).map((m) => m.id);
  assert.equal(best[0], "fal:wan-3.0-prime");
});

test("expected profile smooths acceptance with a prior and uses measured latency only with enough attempts", () => {
  const dop = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:dop-lite")!;
  const seeded = expectedProfile(dop);
  assert.equal(seeded.acceptance, 0.6);
  assert.equal(Math.round(seeded.expectedWaitSec), Math.round(dop.latencyEstimateSec / 0.6));
  const real = expectedProfile(dop, measured["higgsfield:dop-lite"]);
  assert.ok(real.acceptance < 0.5 && real.acceptance > 0.4);
  assert.equal(Math.round(real.expectedWaitSec), Math.round(257 / real.acceptance));
});

test("a fan-out round ends at the first pass and hands back the still-running sibling", async () => {
  const slow = new Promise<{ ok: boolean; id: string }>((r) => setTimeout(() => r({ ok: true, id: "slow" }), 200));
  const fast = new Promise<{ ok: boolean; id: string }>((r) => setTimeout(() => r({ ok: true, id: "fast" }), 20));
  const t0 = Date.now();
  const { done, pending } = await firstPassing([slow, fast]);
  assert.deepEqual(done.map((d) => d.id), ["fast"]);
  assert.equal(pending.length, 1);
  assert.ok(Date.now() - t0 < 150, "did not wait for the slow sibling");
  const allFail = await firstPassing([Promise.resolve({ ok: false, id: "a" }), Promise.resolve({ ok: false, id: "b" })]);
  assert.equal(allFail.done.length, 2);
  assert.equal(allFail.pending.length, 0);
});

test("with Higgsfield preferred, its own transition engine (DoP start+end frame) leads and fal stays behind as the fallback", (t) => {
  const { force, prefer } = config.providers;
  config.providers.force = "";
  config.providers.prefer = "higgsfield";
  t.after(() => { config.providers.force = force; config.providers.prefer = prefer; });
  for (const provider of PROVIDERS) t.mock.method(provider, "isAvailable", () => true);
  const route = routeModels({ recipe: getRecipe("dissolve-match"), mode: "preview", measured });
  assert.equal(route[0].id, "higgsfield:dop-turbo-flf", route.map((m) => m.id).join(" > "));
  for (const recipe of ["liquid-transform", "object-morph", "whip-pan", "earth-zoom"]) {
    assert.equal(routeModels({ recipe: getRecipe(recipe), mode: "preview", measured })[0].ownPrompt, true, `${recipe} goes to Higgsfield's own engine`);
  }
  const firstFal = route.findIndex((m) => m.providerId === "fal");
  assert.ok(firstFal > 0 && route.slice(0, firstFal).every((m) => m.providerId === "higgsfield"), "every Higgsfield model before any fal model");
});
