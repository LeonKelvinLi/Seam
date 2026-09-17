/**
 * fal.ai provider: first-and-last-frame video models behind one queue API
 * (submit -> poll status_url -> fetch response_url -> download video). Each model names its frame fields differently,
 * so the request body comes from FAL_BODIES.
 *
 * Routing order comes from a 2026-09-16 comparison of ten models on one pair (coffee cup to open ocean, same frames,
 * same written shot; data/live-results/2026-09-16-model-eval). Wan 3.0 Prime carried the drop's ripple onto the sea,
 * MiniMax H3 Max opened the coffee into the sea inside the rim in 13 s, and Kling O3 Pro did the same at 1080p. Kling v3
 * Pro double-exposed the cup over the sea, Flux 3 and Seedance 2.5 faded through black, and Veo 3.1 wiped half and half
 * at $1.60 a take. Kling 2.1 Pro stays as a fallback: with the recipe template it tilted or blended.
 */
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { download } from "@/core/media/ffmpeg";
import { jpegDataUri } from "@/core/media/image";
import { ProviderError, pollUntil, type ModelSpec, type TransitionProvider, type TransitionRequest, type TransitionResult } from "./types";

const log = logger("fal");

const KLING_STRENGTHS = { fpv: 0.75, morph: 0.7, human: 0.8, environment: 0.8, product: 0.75, generic: 0.8 };

export const FAL_MODELS: ModelSpec[] = [
  {
    id: "fal:minimax-h3-max", providerId: "fal", endpoint: "minimax/h3-max/image-to-video",
    label: "MiniMax H3 Max", supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.025, tier: "both",
    strengths: { fpv: 0.85, morph: 0.9, human: 0.8, environment: 0.88, product: 0.85, generic: 0.88 }, dialect: "plain", latencyEstimateSec: 30,
  },
  {
    id: "fal:wan-3.0-prime", providerId: "fal", endpoint: "alibaba/wan-3.0-prime/image-to-video",
    label: "Wan 3.0 Prime", supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.05, tier: "both",
    strengths: { fpv: 0.85, morph: 0.92, human: 0.8, environment: 0.9, product: 0.85, generic: 0.9 }, dialect: "plain", latencyEstimateSec: 105,
  },
  {
    id: "fal:kling-o3-pro", providerId: "fal", endpoint: "fal-ai/kling-video/o3/pro/image-to-video",
    label: "Kling O3 Pro", supportsLastFrame: true, durations: [4], costPerSecondUsd: 0.14, tier: "both",
    strengths: { fpv: 0.85, morph: 0.9, human: 0.85, environment: 0.88, product: 0.88, generic: 0.88 }, dialect: "plain", latencyEstimateSec: 110,
  },
  {
    id: "fal:kling-2.1-standard", providerId: "fal", endpoint: "fal-ai/kling-video/v2.1/standard/image-to-video",
    label: "Kling 2.1 Standard", supportsLastFrame: false, durations: [5, 10], costPerSecondUsd: 0.05, tier: "preview",
    strengths: { ...KLING_STRENGTHS, fpv: 0.65 }, dialect: "kling", latencyEstimateSec: 150,
  },
  {
    id: "fal:kling-2.1-pro", providerId: "fal", endpoint: "fal-ai/kling-video/v2.1/pro/image-to-video",
    label: "Kling 2.1 Pro", supportsLastFrame: true, durations: [5, 10], costPerSecondUsd: 0.09, tier: "both",
    // Measured on production 2026-09-16: ~100 s wall time and accepted first try; usable for previews as well as finals.
    strengths: { ...KLING_STRENGTHS, fpv: 0.7, morph: 0.65, environment: 0.7, generic: 0.7 }, dialect: "kling", latencyEstimateSec: 110,
  },
];

type FalBody = (req: TransitionRequest, first: string, last: string, duration: number) => Record<string, unknown>;

/** Request bodies for models whose schema differs from Kling 2.1's. Audio is off: the stitch lays its own track. */
export const FAL_BODIES: Record<string, FalBody> = {
  "fal:minimax-h3-max": (req, first, last, duration) => ({
    prompt: req.prompt.positive, image_url: first, end_image_url: last, duration, resolution: "768P", prompt_expansion_mode: "balanced",
  }),
  "fal:wan-3.0-prime": (req, first, last, duration) => ({
    prompt: req.prompt.positive, start_image_url: first, end_image_url: last, duration, resolution: "720p", aspect_ratio: req.aspectRatio, audio: false,
  }),
  "fal:kling-o3-pro": (req, first, last, duration) => ({
    prompt: req.prompt.positive, image_url: first, end_image_url: last, duration: String(duration), generate_audio: false,
  }),
};

function klingBody(req: TransitionRequest, first: string, last: string, duration: number, model: ModelSpec) {
  return {
    prompt: req.prompt.positive,
    image_url: first,
    ...(model.supportsLastFrame ? { tail_image_url: last } : {}),
    duration: String(duration),
    negative_prompt: req.prompt.negative ?? "blur, distort, low quality",
    cfg_scale: Math.round((0.35 + (1 - req.motionStrength) * 0.3) * 100) / 100,
  };
}

interface QueueSubmit { request_id: string; status_url: string; response_url: string }
interface QueueStatus { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"; queue_position?: number; error?: string }

async function falFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Key ${config.providers.falKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`fal ${res.status}: ${body.slice(0, 300)}`, retryable, "fal");
  }
  return (await res.json()) as T;
}

export const falProvider: TransitionProvider = {
  id: "fal",
  name: "fal.ai",
  models: FAL_MODELS,
  isAvailable: () => config.providers.falKey !== "",
  async generateTransition(req: TransitionRequest, model: ModelSpec): Promise<TransitionResult> {
    const duration = model.durations[0] ?? 5;
    // A model without a last frame (Kling 2.1 Standard) never opens one.
    const [first, last] = await Promise.all([jpegDataUri(req.firstFramePath, 1280), model.supportsLastFrame ? jpegDataUri(req.lastFramePath, 1280) : ""]);
    const body = FAL_BODIES[model.id];
    const input: Record<string, unknown> = body ? body(req, first, last, duration) : klingBody(req, first, last, duration, model);
    req.onProgress?.("Sending frames to the video model");
    const submit = await falFetch<QueueSubmit>(`https://queue.fal.run/${model.endpoint}`, { method: "POST", body: JSON.stringify(input) });
    log.info("submitted", { model: model.id, requestId: submit.request_id });

    await pollUntil(async () => {
      const s = await falFetch<QueueStatus>(submit.status_url, { method: "GET" });
      if (s.status === "COMPLETED") return true;
      req.onProgress?.(s.status === "IN_QUEUE" ? `Waiting in line (${s.queue_position ?? "?"} ahead)` : "Generating the camera move");
      return null;
    }, 3000, 15 * 60_000, `fal ${model.label}`);

    const result = await falFetch<{ video?: { url?: string } }>(submit.response_url, { method: "GET" });
    const url = result.video?.url;
    if (!url) throw new ProviderError("fal returned no video", true, "fal");
    await download(url, req.outputPath);
    return {
      outputPath: req.outputPath, providerJobId: submit.request_id, rawDurationSec: duration,
      costUsd: duration * model.costPerSecondUsd, params: { duration, endpoint: model.endpoint, ...(input.cfg_scale !== undefined ? { cfg_scale: input.cfg_scale } : {}) },
    };
  },
};
