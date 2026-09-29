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
    // gpt-5.6-sol matched a human review of eleven bridges on 2026-09-16 (good ones 90 to 95, blends and cuts 43 to 78);
    // gpt-5.4-mini passed three blends and a hard cut above 90, and gpt-6-astra failed clean morphs.
    judgeModel: env("SEAM_JUDGE_MODEL", "gpt-5.6-sol"),
    /** Answers when the judge model is rate limited or down. */
    judgeFallbackModel: env("SEAM_JUDGE_FALLBACK_MODEL", "gpt-5.4-mini"),
    /** Writes the shot each bridge model renders (prompt/director.ts). */
    directorModel: env("SEAM_DIRECTOR_MODEL", "gpt-5.6-sol"),
  },
  providers: {
    falKey: env("FAL_KEY"),
    runwaySecret: env("RUNWAYML_API_SECRET"),
    higgsfieldKeyId: env("HIGGSFIELD_API_KEY_ID"),
    higgsfieldKeySecret: env("HIGGSFIELD_API_KEY_SECRET"),
    force: env("SEAM_FORCE_PROVIDER") as "" | "local" | "fal" | "runway" | "higgsfield",
    /** One bridge model id that every attempt is routed to (proof runs, debugging). Empty in production. */
    forceModel: env("SEAM_FORCE_MODEL"),
  },
  generation: {
    maxAttempts: num("SEAM_MAX_ATTEMPTS", 3),
    qualityThreshold: num("SEAM_QUALITY_THRESHOLD", 82),
    // Calibrated for gpt-5.6-sol on 2026-09-16: clean morphs scored 90 to 95, a ghosted rim 78, blends 43 to 49.
    qualityThresholdPreview: num("SEAM_QUALITY_THRESHOLD_PREVIEW", 80),
    /** Bridge models tried concurrently on the first round (1 = sequential; 2 halves the wait at double provider cost). */
    parallelAttempts: num("SEAM_PARALLEL_ATTEMPTS", 1),
    /** Provider generation fees allowed per UTC day. Past it, generation stops rather than shipping a crossfade. 0 disables the guard. */
    dailyBudgetUsd: num("SEAM_DAILY_PROVIDER_BUDGET_USD", 25),
    /** Customers who have paid keep generating until this higher ceiling, so free-trial traffic cannot lock them out. */
    dailyPaidBudgetUsd: num("SEAM_DAILY_PAID_BUDGET_USD", 150),
    /** Deliver the procedural ffmpeg bridge when no AI bridge passes. Off by default: Clipmelt ships AI transitions only. */
    allowProcedural: ["1", "true", "yes"].includes(env("SEAM_ALLOW_PROCEDURAL").toLowerCase()),
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
    // 0.35 with the bridge near real speed measured smoothest (scripts/smoothness-bench.ts, 2026-09-28); the bridge's
    // first and last frames reproduce the footage, so the dissolve blends near-identical images, not a double exposure.
    seamCrossfadeSec: num("SEAM_SEAM_CROSSFADE_SEC", 0.35),
    /**
     * The fastest an AI bridge is played back relative to how the model rendered it. Higgsfield's Transitions app plays
     * its renders at real speed (scripts/hf-study.py); 1.25 plays a 5 s render in 4 s with the joins at real speed.
     * The old 2.5 (5 s in 2 s) turned camera moves into a quick effect: on five Higgsfield bridges the speed jump at
     * the joins (lurch) fell from 2.3-7.0 to 1.3-2.5 on the four ordinary pairs at 1.25 with a 0.35 s crossfade.
     */
    maxBridgeSpeedup: num("SEAM_MAX_BRIDGE_SPEEDUP", 1.25),
    /**
     * Speed-ramp the bridge instead of playing it at one constant speed: near real speed where it meets the footage,
     * fastest in the middle. A constant 2.5x lurched at both joins (footage at 1x, bridge at 2.5x).
     */
    bridgeRamp: (process.env.SEAM_BRIDGE_RAMP ?? "1") !== "0",
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
      config.generation.allowProcedural ? "local (ffmpeg, fallback forced on)" : "local (ffmpeg, only when no bridge model is configured)",
      config.providers.falKey ? "fal (Wan 3.0 Prime, MiniMax H3 Max, Kling O3 Pro, Kling 2.1)" : null,
      config.providers.runwaySecret ? "runway (Gen-4 Turbo)" : null,
      config.providers.higgsfieldKeyId && config.providers.higgsfieldKeySecret ? "higgsfield (DoP, Hailuo-02)" : null,
    ].filter(Boolean),
    mode: config.generation.defaultMode,
    forcedProvider: config.providers.force || null,
  };
}
