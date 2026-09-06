import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { resolveMediaPath } from "@/core/media/storage";
import { canReadMedia } from "@/lib/server/access";
import { getUserId } from "@/lib/server/session";

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  const abs = resolveMediaPath(segs);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  if (!canReadMedia(abs, await getUserId(), url.searchParams.get("share"))) return new Response("Not found", { status: 404 });
  const stat = fs.statSync(abs);
  const type = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", Vary: "Cookie" };
  const downloadName = url.searchParams.get("download");
  if (downloadName) headers["Content-Disposition"] = `attachment; filename="${path.basename(downloadName).replace(/["\r\n\\]/g, "_")}"`;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    const invalidRange = () => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    if (!m || (!m[1] && !m[2]) || (!m[1] && Number(m[2]) === 0)) return invalidRange();
    const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= stat.size || start > end) return invalidRange();
    const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(stat.size) } });
}
