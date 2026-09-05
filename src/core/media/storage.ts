import path from "node:path";
import fs from "node:fs";
import { config } from "@/core/config";

/** Absolute path helpers. Everything user-generated lives under config.dataDir. */
export const storage = {
  upload: (assetId: string, ext: string) => path.join(config.uploadsDir, `${assetId}${ext}`),
  proxy: (assetId: string) => path.join(config.uploadsDir, `${assetId}.proxy.mp4`),
  thumbnail: (assetId: string) => path.join(config.uploadsDir, `${assetId}.thumb.jpg`),
  frameDir: (assetId: string) => path.join(config.framesDir, assetId),
  renderDir: (generationId: string) => path.join(config.rendersDir, generationId),
  tmp: (name: string) => path.join(config.tmpDir, name),
  ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); return p; },
};

/** Convert an absolute path under dataDir into a URL served by /api/media. */
export function mediaUrl(absPath: string | null | undefined): string | null {
  if (!absPath) return null;
  const rel = path.relative(config.dataDir, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return "/api/media/" + rel.split(path.sep).map(encodeURIComponent).join("/");
}

/** Resolve a /api/media/* request path back to disk, refusing traversal. */
export function resolveMediaPath(segments: string[]): string | null {
  const rel = segments.map(decodeURIComponent).join("/");
  const abs = path.resolve(config.dataDir, rel);
  if (!abs.startsWith(config.dataDir + path.sep)) return null;
  return abs;
}

export function extForMime(mime: string, fallbackName = ""): string {
  const map: Record<string, string> = {
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-m4v": ".m4v",
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  };
  return map[mime] ?? (path.extname(fallbackName).toLowerCase() || ".bin");
}

export function kindForMime(mime: string, name = ""): "video" | "image" | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  const ext = path.extname(name).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "image";
  return null;
}
