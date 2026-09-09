import path from "node:path";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => {
  const v = Number(env(k));
  return Number.isFinite(v) && env(k) !== "" ? v : d;
};

// SEAM_DATA_DIR may point anywhere; the ignore comment stops the bundler from tracing the whole cwd.
const dataDir = env("SEAM_DATA_DIR") ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), env("SEAM_DATA_DIR")) : path.join(process.cwd(), "data");

export type GenerationMode = "preview" | "final";

export const config = {
  dataDir,
  dbPath: path.join(dataDir, "seam.sqlite"),
  uploadsDir: path.join(dataDir, "uploads"),
  framesDir: path.join(dataDir, "frames"),
  rendersDir: path.join(dataDir, "renders"),
  tmpDir: path.join(dataDir, "tmp"),

  ffmpegPath: env("FFMPEG_PATH", "ffmpeg"),
  ffprobePath: env("FFPROBE_PATH", "ffprobe"),

  openai: {
    get enabled() {
      return env("OPENAI_API_KEY") !== "";
    },
    visionModel: env("SEAM_VISION_MODEL", "gpt-5.4-mini"),
    judgeModel: env("SEAM_JUDGE_MODEL", "gpt-5.4-mini"),
  },
  providers: {
    falKey: env("FAL_KEY"),
    runwaySecret: env("RUNWAYML_API_SECRET"),
    higgsfieldKeyId: env("HIGGSFIELD_API_KEY_ID"),
    higgsfieldKeySecret: env("HIGGSFIELD_API_KEY_SECRET"),
    force: env("SEAM_FORCE_PROVIDER") as "" | "local" | "fal" | "runway" | "higgsfield",
  },
  generation: {
    maxAttempts: num("SEAM_MAX_ATTEMPTS", 3),
    qualityThreshold: num("SEAM_QUALITY_THRESHOLD", 72),
    qualityThresholdPreview: num("SEAM_QUALITY_THRESHOLD_PREVIEW", 65),
    /** Bridge models tried concurrently on the first round (1 = sequential; 2 halves the wait at double provider cost). */
    parallelAttempts: num("SEAM_PARALLEL_ATTEMPTS", 1),
    /** Provider generation fees allowed per UTC day before the router falls back to ffmpeg. 0 disables the guard. */
    dailyBudgetUsd: num("SEAM_DAILY_PROVIDER_BUDGET_USD", 25),
    defaultMode: (env("SEAM_DEFAULT_MODE", "preview") as GenerationMode) || "preview",
  },
  analysis: {
    /** Seconds inspected on each side of the cut when hunting for the best boundary frame. */
    boundaryWindowSec: 1.5,
    /** Candidate frames sampled per second inside that window. */
    candidateFps: 6,
    /** Frames per side actually sent to the vision model. */
    visionFramesPerSide: 3,
  },
  output: {
    fps: 30,
    /** Longest edge of the delivered video. */
    maxEdge: 1280,
    /** Seconds of crossfade at each seam between footage and the AI bridge. */
    seamCrossfadeSec: 0.12,
    /** Hold duration used when an uploaded still image needs to become footage. */
    imageHoldSec: 1.6,
  },
  publicUrl: env("SEAM_PUBLIC_URL"),
};

export function describeRuntime() {
  return {
    vision: config.openai.enabled ? `OpenAI (${config.openai.visionModel})` : "heuristic (no OPENAI_API_KEY)",
    judge: config.openai.enabled ? `OpenAI (${config.openai.judgeModel})` : "heuristic",
    providers: [
      "local (ffmpeg, always on)",
      config.providers.falKey ? "fal (Kling 2.1)" : null,
      config.providers.runwaySecret ? "runway (Gen-4 Turbo)" : null,
      config.providers.higgsfieldKeyId && config.providers.higgsfieldKeySecret ? "higgsfield (DoP, Veo 3.1 first→last)" : null,
    ].filter(Boolean),
    mode: config.generation.defaultMode,
    forcedProvider: config.providers.force || null,
  };
}
