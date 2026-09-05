import { test } from "node:test";
import assert from "node:assert/strict";
import { bestMoments, curate, orderForStory } from "@/core/director/moments";
import { feat } from "./fixtures";

const series = (clipId: string, fn: (t: number) => Partial<ReturnType<typeof feat>>, sec = 6, fps = 4) =>
  ({ clipId, frames: Array.from({ length: sec * fps }, (_, i) => ({ t: i / fps, features: feat(fn(i / fps)) })) });

test("best moments avoid blurry, dark stretches", () => {
  const clip = series("c1", (t) => (t < 3 ? { sharpness: 0.1, brightness: 0.1 } : { sharpness: 0.9, brightness: 0.5, motion: 0.2 }));
  const m = bestMoments("c1", clip.frames, 1.5);
  assert.ok(m[0].start >= 3, `best moment should be in the sharp half, got ${m[0].start}`);
  assert.ok(m[0].reasons.includes("sharp and well lit"));
});

test("curation drops weak shots and orders hook -> peak -> calm ending", () => {
  const strong = series("a", () => ({ sharpness: 0.9, motion: 0.3 }));
  const weak = series("c", () => ({ sharpness: 0.1, brightness: 0.05 }));
  const calm = series("d", () => ({ sharpness: 0.85, motion: 0.0, dominantColors: ["#1a6ea3", "#06263f", "#ffffff"] }));
  const out = curate([strong, weak, calm], 6, 1.5);
  assert.ok(out.length >= 2);
  assert.ok(!out.some((m) => m.clipId === "c"), "weak clip removed");
  const ordered = orderForStory(out);
  assert.equal(ordered[ordered.length - 1].energy, Math.min(...out.map((m) => m.energy)));
});
