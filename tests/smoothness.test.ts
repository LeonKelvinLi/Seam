import { test } from "node:test";
import assert from "node:assert/strict";
import { speedRamp } from "@/core/media/ffmpeg";
import { joinSmoothness } from "@/core/quality/smoothness";

/** Evaluate the ramp's setpts expression (output seconds for source second T). */
const at = (expr: string, T: number) => Function("T", "PI", "sin", `return ${expr};`)(T, Math.PI, Math.sin) as number;

test("the bridge ramp keeps the total length, never runs backwards, and is slowest where it meets the footage", () => {
  const expr = speedRamp(5, 2)!;
  assert.ok(expr);
  assert.ok(Math.abs(at(expr, 5) - 2) < 1e-3, "5 s of render still lasts 2 s");
  let prev = -1;
  const rate = (T: number) => (at(expr, T + 0.01) - at(expr, T)) / 0.01; // output seconds per source second
  for (let T = 0; T <= 5; T += 0.05) { const t = at(expr, T); assert.ok(t >= prev); prev = t; }
  assert.ok(rate(0) > rate(2.5) * 3, "the ends play several times slower than the middle");
  assert.ok(Math.abs(rate(0) - rate(4.99)) < 0.02, "both joins get the same pace");
  assert.equal(speedRamp(2.1, 2), null, "no real speed-up: keep the linear retime");
});

test("a single spiking frame at a join reads as a jolt; steady motion does not", () => {
  const steady = Array.from({ length: 90 }, () => 4);
  assert.ok(joinSmoothness(steady, 30, 1.5).jolt < 1.1);
  const cut = steady.slice(); cut[44] = 40;
  assert.ok(joinSmoothness(cut, 30, 1.5).jolt > 5);
  const lurch = [...Array(45).fill(3), ...Array(45).fill(9)];
  assert.ok(Math.abs(joinSmoothness(lurch, 30, 1.5).lurch - 3) < 0.2, "tripled motion across the join is a lurch of 3");
});
