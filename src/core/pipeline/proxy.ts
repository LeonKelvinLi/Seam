/**
 * Proxies: each clip re-encoded to the project's frame and frame rate. On the server's single core they are the
 * slowest part of analysis (a 20 s 4K phone clip takes about 24 s), so every upload starts its own the moment it
 * lands and analysis waits on that work instead of starting it after both uploads.
 */
import fs from "node:fs";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { chooseOutputFrame, imageToClip, makeProxy, probe, type FrameSpec } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import { Assets } from "@/db/repo";
import type { Asset } from "@/core/types";

const log = logger("proxy");
const inflight = new Map<string, { key: string; promise: Promise<Asset> }>();

/** The project's frame follows the start clip's shape. */
export function specForStart(start: Pick<Asset, "width" | "height">): FrameSpec {
  return { ...chooseOutputFrame(start.width ?? 0, start.height ?? 0), fps: config.output.fps };
}

async function build(asset: Asset, spec: FrameSpec): Promise<Asset> {
  if (asset.proxyPath && fs.existsSync(asset.proxyPath)) {
    // Made for this frame? A replaced start clip can change the project's shape after the end clip's proxy exists.
    const info = await probe(asset.proxyPath);
    if (info.width === spec.width && info.height === spec.height) return asset;
  }
  const out = storage.proxy(asset.id);
  if (asset.kind === "video") {
    await makeProxy(asset.path, out, spec, asset.hasAudio);
  } else {
    await imageToClip(asset.path, out, spec, config.output.imageHoldSec, asset.role === "start" ? "in" : "out");
  }
  const info = await probe(out);
  Assets.update(asset.id, { proxyPath: out, durationSec: info.durationSec, fps: info.fps });
  return { ...asset, proxyPath: out, durationSec: info.durationSec, fps: info.fps };
}

/** The proxy for this frame, joining a build already under way for the same asset and frame. */
export function ensureProxy(asset: Asset, spec: FrameSpec): Promise<Asset> {
  const key = `${spec.width}x${spec.height}@${spec.fps}`;
  const running = inflight.get(asset.id);
  if (running?.key === key) return running.promise;
  const promise = (running ? running.promise.catch(() => asset) : Promise.resolve(asset))
    .then((a) => build({ ...asset, proxyPath: a.proxyPath }, spec))
    .finally(() => { if (inflight.get(asset.id)?.promise === promise) inflight.delete(asset.id); });
  inflight.set(asset.id, { key, promise });
  return promise;
}

/**
 * Called right after an upload: start the proxies whose frame is already known. The end clip has to wait for the start
 * clip (it sets the frame); a new start clip also starts the end clip's. Failures surface again when analysis retries.
 */
export function prepareProxies(projectId: string): void {
  const start = Assets.byRole(projectId, "start");
  if (!start) return;
  const spec = specForStart(start);
  for (const asset of [start, Assets.byRole(projectId, "end")]) {
    if (asset) void ensureProxy(asset, spec).catch((e) => log.warn("early proxy failed", { asset: asset.id, error: (e as Error).message }));
  }
}
