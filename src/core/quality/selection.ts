import type { QualityScores } from "@/core/types";
import { passes } from "./judge";

/** A high aggregate score cannot override a failed endpoint-fidelity gate. */
export function selectPassingCandidate<T extends { scores: QualityScores }>(current: T | null, candidate: T): T | null {
  const accepted = current && passes(current.scores) ? current : null;
  if (!passes(candidate.scores)) return accepted;
  return !accepted || candidate.scores.overall > accepted.scores.overall ? candidate : accepted;
}
