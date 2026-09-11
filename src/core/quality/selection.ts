import type { QualityScores } from "@/core/types";
import { passes } from "./judge";

/**
 * A high aggregate score cannot override a failed endpoint-fidelity gate. A take is held to the bar of the generation's
 * own mode, exactly as the attempt was: a preview take that cleared the preview threshold must not be discarded for
 * missing the stricter final one.
 */
export function selectPassingCandidate<T extends { scores: QualityScores }>(current: T | null, candidate: T, mode: "preview" | "final" = "final"): T | null {
  const accepted = current && passes(current.scores, mode) ? current : null;
  if (!passes(candidate.scores, mode)) return accepted;
  return !accepted || candidate.scores.overall > accepted.scores.overall ? candidate : accepted;
}
