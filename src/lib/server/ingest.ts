import fs from "node:fs";
import path from "node:path";
import { newId, now } from "@/core/ids";
import { extractFrameAt, probe } from "@/core/media/ffmpeg";
import { imageSize, thumbnail } from "@/core/media/image";
import { extForMime, kindForMime, storage } from "@/core/media/storage";
import { Assets, Events, Projects, insert } from "@/db/repo";
import { prepareProxies } from "@/core/pipeline/proxy";
import type { Asset, AssetRole } from "@/core/types";
import { ownedProject } from "./access";

const MAX_BYTES = 500 * 1024 * 1024;

export async function ingestFile(args: { projectId: string; userId: string; role: AssetRole; buffer: Buffer; originalName: string; mime: string }): Promise<Asset> {
  const { projectId, role, buffer, originalName, mime } = args;
  if (!ownedProject(projectId, args.userId)) throw new Error("project not found");
  const kind = kindForMime(mime, originalName);
  if (!kind) throw new Error("Please upload an MP4, MOV, WebM, JPG, PNG or WebP file.");
  if (buffer.length > MAX_BYTES) throw new Error("That file is over 500 MB.");
  if (buffer.length === 0) throw new Error("That file is empty.");

  for (const old of Assets.removeForRole(projectId, role)) {
    for (const p of [old.path, old.proxyPath, old.thumbnailPath]) if (p) fs.rmSync(p, { force: true });
    fs.rmSync(storage.frameDir(old.id), { recursive: true, force: true });
  }

  const id = newId("ast");
  const filePath = storage.upload(id, extForMime(mime, originalName));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  const thumbPath = storage.thumbnail(id);

  let meta: Pick<Asset, "durationSec" | "width" | "height" | "fps" | "hasAudio">;
  if (kind === "video") {
    const info = await probe(filePath);
    if (!info.hasVideo || info.durationSec <= 0) throw new Error("We couldn't read that video. Try exporting it as MP4 (H.264).");
    meta = { durationSec: info.durationSec, width: info.width, height: info.height, fps: info.fps, hasAudio: info.hasAudio };
    const t = role === "start" ? Math.max(0, info.durationSec - 0.1) : Math.min(info.durationSec, 0.1);
    const raw = storage.tmp(`${id}_thumb_raw.jpg`);
    await extractFrameAt(filePath, t, raw);
    await thumbnail(raw, thumbPath, 720);
    fs.rmSync(raw, { force: true });
  } else {
    const size = await imageSize(filePath);
    if (!size.width) throw new Error("We couldn't read that image.");
    meta = { durationSec: null, width: size.width, height: size.height, fps: null, hasAudio: false };
    await thumbnail(filePath, thumbPath, 720);
  }

  const asset = insert<Asset>("assets", {
    id, projectId, role, kind, originalName, mime, path: filePath, sizeBytes: buffer.length, ...meta, thumbnailPath: thumbPath, proxyPath: null, createdAt: now(),
  });
  Projects.update(projectId, { status: "draft", analysisError: null });
  // Re-encoding is the slow part of analysis; start it now, while the other clip is still being picked or uploaded.
  prepareProxies(projectId);
  Events.track("upload_completed", { userId: args.userId, projectId, props: { role, kind, bytes: buffer.length, durationSec: meta.durationSec } });
  return asset;
}
