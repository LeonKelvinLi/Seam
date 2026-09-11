import { test } from "node:test";
import assert from "node:assert/strict";
import { findSeamBreaks, SEAM_H, SEAM_W } from "@/core/quality/seamless";
import { applySeamBreaks, passes } from "@/core/quality/judge";
import type { QualityScores } from "@/core/types";

const FPS = 30;
const PX = SEAM_W * SEAM_H;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/** A synthetic shot twice as wide as the frame: soft shapes plus fine grain, like a photo at 160x90. */
function shot(seed: number) {
  const r = rng(seed), w = SEAM_W * 2;
  const waves = Array.from({ length: 8 }, () => ({ fx: 0.02 + r() * 0.2, fy: 0.02 + r() * 0.2, phase: r() * 6.3, amp: 10 + r() * 25 }));
  const px = new Float64Array(w * SEAM_H);
  for (let y = 0; y < SEAM_H; y++) {
    for (let x = 0; x < w; x++) {
      let v = 128 + (r() - 0.5) * 60;
      for (const q of waves) v += q.amp * Math.sin(q.fx * x + q.fy * y + q.phase);
      px[y * w + x] = v;
    }
  }
  return { w, px };
}

/** What a camera sees of `s` from column x0, with a little sensor noise; a pan moves x0. */
function view(s: { w: number; px: Float64Array }, x0: number, noiseSeed: number) {
  const r = rng(noiseSeed + 7), f = new Float64Array(PX);
  for (let y = 0; y < SEAM_H; y++) for (let x = 0; x < SEAM_W; x++) f[y * SEAM_W + x] = s.px[y * s.w + ((x + Math.round(x0)) % s.w)] + (r() - 0.5) * 4;
  return f;
}
const mix = (a: Float64Array, b: Float64Array, w: number) => a.map((v, i) => w * v + (1 - w) * b[i]);
const hold = (s: ReturnType<typeof shot>, n: number, seed: number) => Array.from({ length: n }, (_, i) => view(s, 0, seed + i));

test("a hold-then-dissolve between two different shots is caught (the DoP failure)", () => {
  const a = shot(1), b = shot(2);
  const blend = Array.from({ length: 6 }, (_, i) => mix(view(a, 0, 100 + i), view(b, 0, 200 + i), 1 - (i + 1) / 7));
  const found = findSeamBreaks([...hold(a, 16, 0), ...blend, ...hold(b, 16, 300)], FPS);
  const d = found.find((x) => x.kind === "dissolve");
  assert.ok(d, `expected a dissolve, got ${JSON.stringify(found)}`);
  assert.ok(d.atSec >= 16 / FPS && d.atSec <= 22 / FPS, `dissolve placed at ${d.atSec}s`);
});

test("a hard cut is caught and placed on the first frame of the new shot", () => {
  const found = findSeamBreaks([...hold(shot(3), 21, 0), ...hold(shot(4), 21, 50)], FPS);
  assert.deepEqual(found.map((x) => x.kind), ["cut"]);
  assert.equal(found[0].atSec, 21 / FPS);
});

test("camera moves and locked-off shots are not flagged", () => {
  const a = shot(5);
  assert.deepEqual(findSeamBreaks(Array.from({ length: 42 }, (_, i) => view(a, i * 2, i)), FPS), [], "steady pan");
  assert.deepEqual(findSeamBreaks(Array.from({ length: 42 }, (_, i) => view(a, i * 7, i)), FPS), [], "fast pan");
  assert.deepEqual(findSeamBreaks(hold(a, 42, 0), FPS), [], "locked-off shot");
});

test("a take with a dissolve or cut never passes, whatever the judge scored", () => {
  const scores: QualityScores = { startFidelity: 98, endFidelity: 90, subjectConsistency: 95, continuity: 80, artifacts: 80, aesthetic: 86, transitionSuccess: 80, overall: 88, issues: [] };
  const broken = applySeamBreaks(scores, [{ kind: "dissolve", atSec: 0.93, strength: 0.32 }]);
  assert.equal(broken.seamless, false);
  assert.equal(passes(broken, "preview"), false);
  assert.match(broken.issues[0], /dissolve/i);
  assert.ok(broken.overall <= 50 && broken.transitionSuccess <= 30, "the stored scores say it failed, so the router learns from it");
  const clean = applySeamBreaks(scores, []);
  assert.equal(clean.seamless, true);
  assert.equal(passes(clean, "preview"), true);
});
