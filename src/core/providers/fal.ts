/**
 * fal.ai provider — Kling 2.1 image-to-video; only Pro accepts `tail_image_url`.
 * Uses the queue API directly: submit -> poll status_url -> fetch response_url -> download video.
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
    id: "fal:kling-2.1-standard", providerId: "fal", endpoint: "fal-ai/kling-video/v2.1/standard/image-to-video",
    label: "Kling 2.1 Standard", supportsLastFrame: false, durations: [5, 10], costPerSecondUsd: 0.05, tier: "preview",
    strengths: { ...KLING_STRENGTHS, fpv: 0.65 }, dialect: "kling", latencyEstimateSec: 150,
  },
  {
    id: "fal:kling-2.1-pro", providerId: "fal", endpoint: "fal-ai/kling-video/v2.1/pro/image-to-video",
    label: "Kling 2.1 Pro", supportsLastFrame: true, durations: [5, 10], costPerSecondUsd: 0.09, tier: "both",
    // Measured on production 2026-09-16: ~100 s wall time and accepted first try; usable for previews as well as finals.
    strengths: { ...KLING_STRENGTHS, fpv: 0.8, morph: 0.78 }, dialect: "kling", latencyEstimateSec: 110,
  },
];

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
    const input = {
      prompt: req.prompt.positive,
      image_url: await jpegDataUri(req.firstFramePath, 1280),
      ...(model.supportsLastFrame ? { tail_image_url: await jpegDataUri(req.lastFramePath, 1280) } : {}),
      duration: String(duration),
      negative_prompt: req.prompt.negative ?? "blur, distort, low quality",
      cfg_scale: Math.round((0.35 + (1 - req.motionStrength) * 0.3) * 100) / 100,
    };
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
      costUsd: duration * model.costPerSecondUsd, params: { duration, cfg_scale: input.cfg_scale, endpoint: model.endpoint },
    };
  },
};
