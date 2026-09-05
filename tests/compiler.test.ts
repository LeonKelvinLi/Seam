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
