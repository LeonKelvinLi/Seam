/**
 * Higgsfield provider (api.higgsfield.ai). Bridge-capable models take both boundary frames: Higgsfield's own DoP models
 * (start image plus end image) and MiniMax Hailuo-02. Veo 3.1 has a first-last-frame endpoint too, but this account
 * cannot use it yet (see HIGGSFIELD_NOT_ENABLED). Frames go up through the presigned upload flow, the generation is
 * submitted, then polled at /requests/{id}/status until "completed".
 * Docs: https://docs.higgsfield.ai (OpenAPI at /docs/openapi.json). `npx tsx scripts/probe-higgsfield.ts` shows which
 * models the configured key can use.
 */
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { download } from "@/core/media/ffmpeg";
import { jpegForModel } from "@/core/media/image";
import { ProviderError, pollUntil, type ModelSpec, type TransitionProvider, type TransitionRequest, type TransitionResult } from "./types";

const log = logger("higgsfield");
export const HIGGSFIELD_BASE = "https://api.higgsfield.ai";

const DOP_STRENGTHS = { fpv: 0.8, morph: 0.6, human: 0.75, environment: 0.8, product: 0.75, generic: 0.75 };

// Every model here takes both boundary frames. Hailuo-02 prices are estimates: the API exposes no price list, so refine
// costPerSecondUsd from the developer dashboard.
export const HIGGSFIELD_MODELS: ModelSpec[] = [
  {
    id: "higgsfield:dop-lite", providerId: "higgsfield", endpoint: "/higgsfield-ai/dop/lite", label: "Higgsfield DoP Lite",
    supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.02, tier: "preview",
    strengths: { ...DOP_STRENGTHS, morph: 0.55 }, dialect: "higgsfield", latencyEstimateSec: 90,
  },
  {
    id: "higgsfield:dop-standard", providerId: "higgsfield", endpoint: "/higgsfield-ai/dop/standard", label: "Higgsfield DoP",
    supportsLastFrame: true, durations: [5], costPerSecondUsd: 0.05, tier: "both",
    strengths: DOP_STRENGTHS, dialect: "higgsfield", latencyEstimateSec: 150,
  },
  {
    // Last-resort retries until proven. First proof run (2026-09-10, paper plane to airliner): 66, the paper melted into
    // a sheet and both scenes cross-dissolved with two planes on screen. DoP Lite scored 82 on a portal the same day.
    id: "higgsfield:hailuo-02-standard", providerId: "higgsfield", endpoint: "/minimax/hailuo-02/standard/image-to-video", label: "Hailuo-02",
    supportsLastFrame: true, durations: [6], costPerSecondUsd: 0.045, tier: "preview",
    strengths: { fpv: 0.45, morph: 0.45, human: 0.45, environment: 0.45, product: 0.45, generic: 0.45 }, dialect: "higgsfield", latencyEstimateSec: 200,
  },
  {
    id: "higgsfield:hailuo-02-pro", providerId: "higgsfield", endpoint: "/minimax/hailuo-02/pro/image-to-video", label: "Hailuo-02 Pro",
    supportsLastFrame: true, durations: [6], costPerSecondUsd: 0.08, tier: "both",
    strengths: { fpv: 0.45, morph: 0.45, human: 0.45, environment: 0.45, product: 0.45, generic: 0.45 }, dialect: "higgsfield", latencyEstimateSec: 260,
  },
];

// Listed in the OpenAPI, but this account's key gets 404 model_not_found from both (probed 2026-09-10, when DoP and
// Hailuo-02 answered the same probe with a validation error). While routed, the fast one was every final render's first
// pick, so that attempt failed in two seconds. Move them back into HIGGSFIELD_MODELS once the probe script reports them
// enabled; prices are estimates.
export const HIGGSFIELD_NOT_ENABLED: ModelSpec[] = [
  {
    id: "higgsfield:veo3.1-fast-flf", providerId: "higgsfield", endpoint: "/veo3.1/fast/first-last-frame-to-video", label: "Veo 3.1 Fast (first→last frame)",
    supportsLastFrame: true, durations: [4, 6, 8], costPerSecondUsd: 0.12, tier: "final",
    strengths: { fpv: 0.75, morph: 0.8, human: 0.85, environment: 0.85, product: 0.8, generic: 0.85 }, dialect: "higgsfield", latencyEstimateSec: 240,
  },
  {
    id: "higgsfield:veo3.1-flf", providerId: "higgsfield", endpoint: "/veo3.1/first-last-frame-to-video", label: "Veo 3.1 (first→last frame)",
    supportsLastFrame: true, durations: [4, 6, 8], costPerSecondUsd: 0.25, tier: "final",
    strengths: { fpv: 0.82, morph: 0.88, human: 0.9, environment: 0.9, product: 0.88, generic: 0.9 }, dialect: "higgsfield", latencyEstimateSec: 320,
  },
];

export const isVeo = (model: ModelSpec) => model.endpoint.startsWith("/veo");
export const isHailuo = (model: ModelSpec) => model.endpoint.startsWith("/minimax/hailuo");

/** Request body per model family, straight from the OpenAPI field names. */
export function buildBody(model: ModelSpec, req: Pick<TransitionRequest, "prompt" | "aspectRatio">, firstUrl: string, lastUrl: string): Record<string, unknown> {
  if (isVeo(model)) {
    return {
      prompt: req.prompt.positive, first_frame_url: firstUrl, last_frame_url: lastUrl,
      duration: String(model.durations[0] ?? 4), resolution: "720", aspect_ratio: req.aspectRatio === "9:16" ? "9:16" : "16:9", generate_audio: false,
    };
  }
  if (isHailuo(model)) {
    // prompt_optimizer would rewrite the shot direction and drop the no-cut and one-object rules; keep it verbatim.
    const standard = model.endpoint.includes("/standard/");
    return {
      prompt: req.prompt.positive, image_url: firstUrl, end_image_url: lastUrl, prompt_optimizer: false,
      ...(standard ? { duration: model.durations[0] ?? 6, resolution: "768P" } : {}),
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

export function authHeader(): string {
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
