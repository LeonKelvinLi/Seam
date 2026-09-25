import type { QualityScores } from "@/core/types";

export const MIN_STYLE_SUCCESS = 80;

/**
 * Whether the selected style visibly happened. Since 2026-09-25 this no longer decides delivery: a clean, seamless
 * take that came out as a different move is handed back (people often like it better) and the studio says so. It
 * still breaks ties between passing takes and shapes the retry.
 */
export function passesStyle(scores: QualityScores): boolean {
  return scores.transitionSuccess >= MIN_STYLE_SUCCESS && (scores.styleMatch === undefined || scores.styleMatch === "matched");
}

/** A take that does not show the selected effect keeps its visual scores; the issue line records what happened. */
export function annotateStyleAssessment(scores: QualityScores): QualityScores {
  if (scores.styleMatch === "matched" && scores.transitionSuccess >= MIN_STYLE_SUCCESS) return scores;
  return {
    ...scores,
    issues: [`Selected style not demonstrated: ${scores.styleEvidence || "The defining visual behavior could not be verified."}`, ...scores.issues].slice(0, 8),
  };
}
