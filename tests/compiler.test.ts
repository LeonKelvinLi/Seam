import { test } from "node:test";
import assert from "node:assert/strict";
import { compileIR, renderPrompt } from "@/core/prompt/compiler";
import { getRecipe } from "@/core/recipes/registry";
import { DEFAULT_FINE_TUNE } from "@/core/types";
import { coffee, ocean, coffeeOceanPair } from "./fixtures";

test("IR carries every section and dialects differ", () => {
  const ir = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe: getRecipe("liquid-transform"), hints: { objectA: "coffee cup", materialA: "coffee", materialB: "water", A: "coffee cup", B: "ocean" }, fineTune: DEFAULT_FINE_TUNE, durationSec: 1.4, aspectRatio: "16:9", attempt: 1 });
  for (const k of ["source", "destination", "transition", "continuity", "camera", "bridge", "end", "preserve"] as const) assert.ok(ir[k].length > 10, k);
  assert.ok(ir.avoid.includes("extra hands"));
  assert.match(ir.bridge, /coffee/);
  const kling = renderPrompt(ir, "kling"), runway = renderPrompt(ir, "runway"), generic = renderPrompt(ir, "generic");
  assert.ok(kling.positive.length <= 2400 && kling.negative && kling.negative.length > 0);
  assert.equal(runway.negative, null);
  assert.ok(runway.positive.length <= 1000);
  assert.match(generic.positive, /SOURCE:/);
  const retry = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe: getRecipe("liquid-transform"), hints: {}, fineTune: DEFAULT_FINE_TUNE, durationSec: 1.4, aspectRatio: "16:9", attempt: 2 });
  assert.match(retry.bridge, /identical to the source frame/);
});

test("a written shot replaces the template, keeps the no-blend rules, and the negative prompt stays short phrases", () => {
  const ir = compileIR({ a: coffee, b: ocean, pair: coffeeOceanPair, recipe: getRecipe("liquid-transform"), hints: {}, fineTune: DEFAULT_FINE_TUNE, durationSec: 1.4, aspectRatio: "16:9", attempt: 1 });
  // Pair risks are sentences for the director; a negative prompt of "problems with <sentence>" only confused the models.
  assert.ok(ir.avoid.every((a) => a.split(/\s+/).length <= 8), ir.avoid.join(" | "));
  assert.ok(ir.avoid.includes("double exposure"));
  const shot = "One continuous shot. Start: a mug on a desk. The camera pushes in. The rim opens into a skylight. The move slows. It settles exactly on the last frame: a sky.";
  const plain = renderPrompt({ ...ir, shot }, "plain"), kling = renderPrompt({ ...ir, shot }, "kling");
  assert.match(plain.positive, /^Required effect: Liquid Transformation/);
  assert.ok(plain.positive.includes(shot));
  assert.match(plain.positive, /no dissolves, no double exposure/);
  assert.equal(plain.negative, null);
  assert.ok(kling.positive.includes(shot));
  assert.match(kling.negative ?? "", /double exposure/);
  // Without a shot, the plain dialect is the Higgsfield template: rules written in, no negative field.
  assert.deepEqual(renderPrompt(ir, "plain"), renderPrompt(ir, "higgsfield"));
});
