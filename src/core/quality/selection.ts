import type { QualityScores } from "@/core/types";
import { passes } from "./judge";
import { passesStyle } from "./style";

/**
 * A high aggregate score cannot override a failed endpoint-fidelity gate. A take is held to the bar of the generation's
 * own mode, exactly as the attempt was: a preview take that cleared the preview threshold must not be discarded for
 * missing the stricter final one.
 */
export function selectPassingCandidate<T extends { scores: QualityScores }>(current: T | null, candidate: T, mode: "preview" | "final" = "final"): T | null {
  const accepted = current && passes(current.scores, mode) ? current : null;
  if (!passes(candidate.scores, mode)) return accepted;
  // Between two deliverable takes, the one that shows the selected style wins; then the better-scored one.
  const rank = (s: QualityScores) => (passesStyle(s) ? 1000 : 0) + s.overall;
  return !accepted || rank(candidate.scores) > rank(accepted.scores) ? candidate : accepted;
}
