import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "@/core/config";
import { selectPassingCandidate } from "@/core/quality/selection";
import type { QualityScores } from "@/core/types";

const quality = (overrides: Partial<QualityScores> = {}): QualityScores => ({
  startFidelity: 85, endFidelity: 85, subjectConsistency: 85, continuity: 85,
  artifacts: 85, aesthetic: 85, transitionSuccess: 85, overall: 85, issues: [], ...overrides,
});

test("a rejected high-score take cannot outrank a passing take or suppress fallback", (t) => {
  const threshold = config.generation.qualityThreshold;
  config.generation.qualityThreshold = 70;
  t.after(() => { config.generation.qualityThreshold = threshold; });
  const rejected = { id: "remote-bad-endpoint", scores: quality({ overall: 98, endFidelity: 44 }) };
  const passed = { id: "faithful-retry", scores: quality({ overall: 76 }) };
  assert.equal(selectPassingCandidate(null, rejected), null, "all-rejected attempts must enter fallback");
  assert.equal(selectPassingCandidate(selectPassingCandidate(null, rejected), passed), passed);
  assert.equal(selectPassingCandidate(passed, rejected), passed);
  assert.equal(selectPassingCandidate(rejected, passed), passed, "defensively discard an invalid prior candidate");
});

test("the fallback is also ineligible when either fidelity or overall quality fails", (t) => {
  const threshold = config.generation.qualityThreshold;
  config.generation.qualityThreshold = 70;
  t.after(() => { config.generation.qualityThreshold = threshold; });
  for (const scores of [quality({ overall: 69 }), quality({ startFidelity: 44 }), quality({ endFidelity: 44 })]) {
    assert.equal(selectPassingCandidate(null, { id: "local-fallback", scores }), null);
  }
  const boundary = { id: "accepted-fallback", scores: quality({ overall: 70, startFidelity: 45, endFidelity: 45 }) };
  assert.equal(selectPassingCandidate(null, boundary), boundary);
});
