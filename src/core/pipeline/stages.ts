/** Internal stage ids -> what the user reads (spec §30). Never show "Job 4 executing". */
export const STAGE_LABELS: Record<string, string> = {
  queued: "Getting ready",
  transcode: "Preparing your clips",
  frames: "Understanding your clips",
  analysis: "Understanding your clips",
  recommendations: "Designing the transition",
  compile: "Designing the transition",
  generate: "Generating the camera move",
  judge: "Checking the result",
  retry: "Trying a better approach",
  stitch: "Making the cut seamless",
  export: "Making the cut seamless",
  ready: "Ready",
  failed: "That one didn't come together",
};

export const ANALYZE_STEPS = ["Preparing your clips", "Understanding your clips", "Designing the transition"];
export const GENERATE_STEPS = ["Designing the transition", "Generating the camera move", "Checking the result", "Making the cut seamless", "Ready"];

export function labelFor(stage: string): string {
  return STAGE_LABELS[stage] ?? STAGE_LABELS.queued;
}
