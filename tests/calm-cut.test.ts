import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryScore, chooseBoundaryPair } from "@/core/analysis/frame-selection";
import type { ExtractedFrame, FrameFeatures } from "@/core/types";

const feats = (motion: number): FrameFeatures => ({
  sharpness: 0.6, brightness: 0.5, contrast: 0.5, edgeDensity: 0.4, motion, driftX: 0, driftY: 0, uniformCoverage: 0.2, dominantColors: ["#808080"], focus: { x: 0.5, y: 0.5 },
});
const frame = (id: string, t: number, motion: number): ExtractedFrame =>
  ({ id, assetId: id.slice(0, 1), t, path: `${id}.jpg`, features: feats(motion), boundaryScore: boundaryScore(feats(motion)), createdAt: "" });

test("the cut moves off a hand gesture at the end of A onto the still moment just before it", () => {
  // pair1_a_paperplane: still until 3.7 s, then the man lifts the plane (features.motion 0.12-0.13 at 6 fps).
  const a = [frame("a1", 3.2, 0.01), frame("a2", 3.37, 0.01), frame("a3", 3.53, 0.01), frame("a4", 3.7, 0.03), frame("a5", 3.87, 0.13), frame("a6", 4.03, 0.12)];
  const b = [frame("b1", 0, 0.01), frame("b2", 0.17, 0.01)];
  const pick = chooseBoundaryPair(a, b, new Map(), 4.2, 0, 1.5);
  assert.ok(pick.a.t < 3.8 && pick.a.t >= 3.5, `cut at ${pick.a.t}s: still, and as late as the stillness allows`);
  assert.equal(pick.b.id, "b1");
});

test("footage that moves the whole way through still cuts near the end", () => {
  const a = [frame("a1", 3.6, 0.36), frame("a2", 3.77, 0.31), frame("a3", 4.27, 0.29), frame("a4", 4.93, 0.3)];
  const b = [frame("b1", 0, 0.05)];
  assert.equal(chooseBoundaryPair(a, b, new Map(), 5.1, 0, 1.5).a.id, "a4");
});
