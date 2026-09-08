/**
 * Higgsfield provider (api.higgsfield.ai). Two bridge-capable families: Higgsfield's own DoP models take a start
 * image plus an optional end image, and Veo 3.1 has a first-last-frame endpoint. Frames go up through the
 * presigned upload flow, the generation is submitted, then polled at /requests/{id}/status until "completed".
 * Docs: https://docs.higgsfield.ai (OpenAPI at /docs/openapi.json).
 */
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { download } from "@/core/media/ffmpeg";
import { jpegForModel } from "@/core/media/image";
import { ProviderError, pollUntil, type ModelSpec, type TransitionProvider, type TransitionRequest, type TransitionResult } from "./types";

const log = logger("higgsfield");
export const HIGGSFIELD_BASE = "https://api.higgsfield.ai";

const DOP_STRENGTHS = { fpv: 0.8, morph: 0.6, human: 0.75, environment: 0.8, product: 0.75, generic: 0.75 };

export const HIGGSFIELD_MODELS: ModelSpec[] = [
  {
    id: "higgsfield:dop-lite", providerId: "higgsfield", endpoint: "/higgsfield-ai/dop/lite", label: "Higgsfield DoP Lite",
    supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.02, tier: "preview",
    strengths: { ...DOP_STRENGTHS, morph: 0.55 }, dialect: "generic", latencyEstimateSec: 90,
  },
  {
    id: "higgsfield:dop-standard", providerId: "higgsfield", endpoint: "/higgsfield-ai/dop/standard", label: "Higgsfield DoP",
    supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.05, tier: "both",
    strengths: DOP_STRENGTHS, dialect: "generic", latencyEstimateSec: 150,
  },
  {
    id: "higgsfield:veo3.1-fast-flf", providerId: "higgsfield", endpoint: "/veo3.1/fast/first-last-frame-to-video", label: "Veo 3.1 Fast (first→last frame)",
    supportsLastFrame: true, durations: [4, 6, 8], costPerSecondUsd: 0.12, tier: "final",
    strengths: { fpv: 0.75, morph: 0.8, human: 0.85, environment: 0.85, product: 0.8, generic: 0.85 }, dialect: "generic", latencyEstimateSec: 240,
  },
];

export const isVeo = (model: ModelSpec) => model.endpoint.startsWith("/veo");

/** Request body per model family, straight from the OpenAPI field names. */
export function buildBody(model: ModelSpec, req: Pick<TransitionRequest, "prompt" | "aspectRatio">, firstUrl: string, lastUrl: string): Record<string, unknown> {
  if (isVeo(model)) {
    return {
      prompt: req.prompt.positive, first_frame_url: firstUrl, last_frame_url: lastUrl,
      duration: String(model.durations[0] ?? 4), resolution: "720", aspect_ratio: req.aspectRatio === "9:16" ? "9:16" : "16:9", generate_audio: false,
    };
  }
  // DoP: our compiled prompt is already a shot description; keep it verbatim.
  return { prompt: req.prompt.positive, image_url: firstUrl, end_image_url: lastUrl, enhance_prompt: false };
}

export interface StatusBody { status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled"; video?: { url?: string } | null; error?: string | null; detail?: string }

/** Terminal states resolve to a URL or a typed error; null means keep polling. */
export function parseStatus(body: StatusBody): { url: string } | null {
  if (body.status === "completed") {
    const url = body.video?.url;
    if (!url) throw new ProviderError("higgsfield completed without a video url", true, "higgsfield");
    return { url };
  }
  if (body.status === "failed" || body.status === "canceled") throw new ProviderError(`higgsfield ${body.status}: ${body.error ?? body.detail ?? "unknown"}`, true, "higgsfield");
  if (body.status === "nsfw") throw new ProviderError("higgsfield refused the frames as unsafe content", false, "higgsfield");
  return null;
}

function authHeader(): string {
  return `Key ${config.providers.higgsfieldKeyId}:${config.providers.higgsfieldKeySecret}`;
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, init); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw new ProviderError(`higgsfield network error: ${(last as Error)?.message ?? String(last)}`, true, "higgsfield");
}

async function hf<T>(path: string, init: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${HIGGSFIELD_BASE}${path}`;
  const res = await fetchWithRetry(url, { ...init, headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    throw new ProviderError(`higgsfield ${res.status}: ${text.slice(0, 300)}`, res.status === 429 || res.status >= 500, "higgsfield");
  }
  return (await res.json()) as T;
}

/** Presigned upload: ask for a URL, PUT the bytes with the returned headers, reference the public URL. */
async function uploadFrame(framePath: string): Promise<string> {
  const bytes = await jpegForModel(framePath, 1280);
  const slot = await hf<{ upload_url: string; public_url: string; upload_headers?: Record<string, string> }>("/files/generate-upload-url", { method: "POST", body: JSON.stringify({ content_type: "image/jpeg" }) });
  const put = await fetch(slot.upload_url, { method: "PUT", headers: { "Content-Type": "image/jpeg", ...(slot.upload_headers ?? {}) }, body: new Uint8Array(bytes) });
  if (!put.ok) throw new ProviderError(`higgsfield upload ${put.status}`, true, "higgsfield");
  return slot.public_url;
}

export const higgsfieldProvider: TransitionProvider = {
  id: "higgsfield",
  name: "Higgsfield",
  models: HIGGSFIELD_MODELS,
  isAvailable: () => config.providers.higgsfieldKeyId !== "" && config.providers.higgsfieldKeySecret !== "",
  async generateTransition(req: TransitionRequest, model: ModelSpec): Promise<TransitionResult> {
    req.onProgress?.("Uploading the boundary frames");
    const [firstUrl, lastUrl] = await Promise.all([uploadFrame(req.firstFramePath), uploadFrame(req.lastFramePath)]);
    const body = buildBody(model, req, firstUrl, lastUrl);
    req.onProgress?.("Sending frames to the video model");
    const created = await hf<{ request_id: string; status: string; status_url?: string }>(model.endpoint, { method: "POST", body: JSON.stringify(body) });
    log.info("request created", { id: created.request_id, model: model.id });
    const statusUrl = created.status_url ?? `${HIGGSFIELD_BASE}/requests/${created.request_id}/status`;

    const done = await pollUntil(async () => {
      const s = await hf<StatusBody>(statusUrl, { method: "GET" });
      const r = parseStatus(s);
      if (!r) req.onProgress?.(s.status === "in_progress" ? "Generating the bridge" : "Waiting for the video model");
      return r;
    }, 4000, 15 * 60_000, "higgsfield");

    await download(done.url, req.outputPath);
    const rawDurationSec = model.durations[0] ?? 5;
    return {
      outputPath: req.outputPath, providerJobId: created.request_id, rawDurationSec,
      costUsd: rawDurationSec * model.costPerSecondUsd, params: { endpoint: model.endpoint, ...body, image_url: undefined, end_image_url: undefined, first_frame_url: undefined, last_frame_url: undefined },
    };
  },
};
