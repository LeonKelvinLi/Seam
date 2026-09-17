import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "@/core/config";
import { selectPassingCandidate } from "@/core/quality/selection";
import type { QualityScores } from "@/core/types";

const take = (overall: number) => ({ scores: { overall, startFidelity: 80, endFidelity: 80, transitionSuccess: 90 } as unknown as QualityScores });
const { qualityThresholdPreview: previewBar, qualityThreshold: finalBar } = config.generation;

test("a preview take is held to the preview bar it was judged against, not the final one", () => {
  assert.ok(previewBar < finalBar, "the preview bar sits below the final bar");
  const t = take(previewBar);
  assert.equal(selectPassingCandidate(null, t, "preview"), t, "a take on the preview bar ships as a preview");
  assert.equal(selectPassingCandidate(null, t, "final"), null, "the same take is below the final bar");
  assert.equal(selectPassingCandidate(null, t), null, "without a mode the stricter final bar applies");
  const better = take(previewBar + 1);
  assert.equal(selectPassingCandidate(t, better, "preview"), better, "the higher passing take wins");
});

test("the 66 take from the 2026-09-10 proof run, a melting dissolve, stays below the default preview bar", () => {
  assert.equal(selectPassingCandidate(null, take(66), "preview"), null);
});
