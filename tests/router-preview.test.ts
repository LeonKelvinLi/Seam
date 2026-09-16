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

test("preview routing puts the fastest-to-accept model first once measurements exist", (t) => {
  const originalForce = config.providers.force;
  config.providers.force = "";
  t.after(() => { config.providers.force = originalForce; });
  for (const provider of PROVIDERS) t.mock.method(provider, "isAvailable", () => true);
  const ids = routeModels({ recipe: getRecipe("dissolve-match"), mode: "preview", measured }).map((m) => m.id);
  assert.equal(ids[0], "fal:kling-2.1-pro", `Kling should lead previews, got ${ids.join(" > ")}`);
  assert.ok(ids.indexOf("higgsfield:dop-lite") < ids.indexOf("higgsfield:dop-standard"), "the slow, rejected DoP Standard ranks below DoP Lite");
  // Seeds alone still keep Kling in the first round of a two-model fan-out.
  const seedIds = routeModels({ recipe: getRecipe("dissolve-match"), mode: "preview" }).map((m) => m.id);
  assert.ok(seedIds.slice(0, 2).includes("fal:kling-2.1-pro"), `Kling should be in the first two on seeds, got ${seedIds.join(" > ")}`);
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
