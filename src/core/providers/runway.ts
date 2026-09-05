/**
 * Runway provider — Gen-4 Turbo image_to_video with first + last keyframes.
 * POST /v1/image_to_video -> poll GET /v1/tasks/{id} until SUCCEEDED.
 */
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { download } from "@/core/media/ffmpeg";
import { jpegDataUri } from "@/core/media/image";
import { ProviderError, pollUntil, type ModelSpec, type TransitionProvider, type TransitionRequest, type TransitionResult } from "./types";

const log = logger("runway");
const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";

export const RUNWAY_MODELS: ModelSpec[] = [
  {
    id: "runway:gen4-turbo", providerId: "runway", endpoint: "gen4_turbo", label: "Runway Gen-4 Turbo",
    supportsLastFrame: true, durations: [5, 10], costPerSecondUsd: 0.05, tier: "both",
    strengths: { fpv: 0.7, morph: 0.6, human: 0.75, environment: 0.75, product: 0.7, generic: 0.75 },
    dialect: "runway", latencyEstimateSec: 90,
  },
];

const RATIOS: Record<TransitionRequest["aspectRatio"], string> = { "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960" };

async function rw<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.providers.runwaySecret}`, "X-Runway-Version": VERSION, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ProviderError(`runway ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500, "runway");
  }
  return (await res.json()) as T;
}

interface Task { id: string; status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "THROTTLED"; output?: string[]; failure?: string; failureCode?: string; progress?: number }

export const runwayProvider: TransitionProvider = {
  id: "runway",
  name: "Runway",
  models: RUNWAY_MODELS,
  isAvailable: () => config.providers.runwaySecret !== "",
  async generateTransition(req: TransitionRequest, model: ModelSpec): Promise<TransitionResult> {
    const duration = model.durations[0] ?? 5;
    const body = {
      model: model.endpoint,
      promptImage: [
        { uri: await jpegDataUri(req.firstFramePath, 1280), position: "first" },
        { uri: await jpegDataUri(req.lastFramePath, 1280), position: "last" },
      ],
      promptText: req.prompt.positive,
      ratio: RATIOS[req.aspectRatio],
      duration,
    };
    req.onProgress?.("Sending frames to the video model");
    const created = await rw<{ id: string }>("/image_to_video", { method: "POST", body: JSON.stringify(body) });
    log.info("task created", { id: created.id });

    const task = await pollUntil(async () => {
      const t = await rw<Task>(`/tasks/${created.id}`, { method: "GET" });
      if (t.status === "SUCCEEDED") return t;
      if (t.status === "FAILED" || t.status === "CANCELLED") throw new ProviderError(`runway task ${t.status}: ${t.failure ?? t.failureCode ?? "unknown"}`, true, "runway");
      req.onProgress?.(t.status === "RUNNING" ? `Generating the camera move${t.progress ? ` (${Math.round(t.progress * 100)}%)` : ""}` : "Waiting for the video model");
      return null;
    }, 3000, 15 * 60_000, "runway");

    const url = task.output?.[0];
    if (!url) throw new ProviderError("runway returned no output", true, "runway");
    await download(url, req.outputPath);
    return {
      outputPath: req.outputPath, providerJobId: created.id, rawDurationSec: duration,
      costUsd: duration * model.costPerSecondUsd, params: { duration, ratio: body.ratio, model: model.endpoint },
    };
  },
};
