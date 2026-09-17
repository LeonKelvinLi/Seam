import type { QualityScores } from "@/core/types";

export const MIN_STYLE_SUCCESS = 80;

export function passesStyle(scores: QualityScores): boolean {
  return scores.transitionSuccess >= MIN_STYLE_SUCCESS && (scores.styleMatch === undefined || scores.styleMatch === "matched");
}

/** A beautiful but wrong or unidentifiable effect is still a failed attempt. */
export function enforceStyleAssessment(scores: QualityScores): QualityScores {
  if (scores.styleMatch === "matched" && scores.transitionSuccess >= MIN_STYLE_SUCCESS) return scores;
  return {
    ...scores,
    transitionSuccess: Math.min(scores.transitionSuccess, 49),
    overall: Math.min(scores.overall, 59),
    issues: [`Selected style not demonstrated: ${scores.styleEvidence || "The defining visual behavior could not be verified."}`, ...scores.issues].slice(0, 8),
  };
}
