/**
 * Import externally generated example media (e.g. from OpenArt / Higgsfield) into the example + sample folders.
 * Input: a JSON file mapping example id -> { a: url|path, b: url|path, bridge?: url|path, title?: string, reverseA?: boolean }
 *   a      = clip that must END on the transition's first frame (set reverseA when it starts on it instead)
 *   b      = clip that STARTS on the transition's last frame
 *   bridge = first/last-frame generated transition (optional; procedural fallback otherwise)
 * Writes public/examples/src/<id>/{a,b,bridge}.mp4 and public/samples/<id>-{a,b}.mp4 (+ manifest entries), then run build-examples.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { download, ffmpeg, probe } from "@/core/media/ffmpeg";
import { extractFrameAt } from "@/core/media/ffmpeg";
import { thumbnail } from "@/core/media/image";

interface Entry { a: string; b: string; bridge?: string; title?: string; reverseA?: boolean }

async function fetchTo(src: string, out: string) {
  if (/^https?:/.test(src)) await download(src, out);
  else fs.copyFileSync(src, out);
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/import-generated.ts mapping.json");
  const map = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Entry>;
  const samplesDir = path.join(process.cwd(), "public", "samples");
  const manifestPath = path.join(samplesDir, "manifest.json");
  const manifest = (fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : []) as { id: string; title: string; a: string; b: string }[];
  for (const [id, e] of Object.entries(map)) {
    const dir = path.join(process.cwd(), "public", "examples", "src", id);
    fs.mkdirSync(dir, { recursive: true });
    const rawA = await fetchTo(e.a, path.join(dir, "a_raw.mp4"));
    const a = path.join(dir, "a.mp4");
    if (e.reverseA) await ffmpeg(["-i", rawA, "-vf", "reverse", "-af", "areverse", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-c:a", "aac", a]).catch(async () => {
      await ffmpeg(["-i", rawA, "-vf", "reverse", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", a]);
    });
    else fs.copyFileSync(rawA, a);
    await fetchTo(e.b, path.join(dir, "b.mp4"));
    if (e.bridge) await fetchTo(e.bridge, path.join(dir, "bridge.mp4"));
    fs.rmSync(rawA, { force: true });
    // samples
    fs.copyFileSync(a, path.join(samplesDir, `${id}-a.mp4`));
    fs.copyFileSync(path.join(dir, "b.mp4"), path.join(samplesDir, `${id}-b.mp4`));
    const pa = path.join(samplesDir, `${id}-a.jpg`), pb = path.join(samplesDir, `${id}-b.jpg`);
    const tmpA = path.join(dir, "pa.jpg"), tmpB = path.join(dir, "pb.jpg");
    await extractFrameAt(a, (await probe(a)).durationSec / 2, tmpA); await thumbnail(tmpA, pa, 640); fs.rmSync(tmpA, { force: true });
    await extractFrameAt(path.join(dir, "b.mp4"), 0.2, tmpB); await thumbnail(tmpB, pb, 640); fs.rmSync(tmpB, { force: true });
    const entry = { id, title: e.title ?? id, a: `${id}-a.mp4`, b: `${id}-b.mp4` };
    const i = manifest.findIndex((m) => m.id === id);
    if (i >= 0) manifest[i] = entry; else manifest.push(entry);
    console.log("imported", id, e.bridge ? "(with generated bridge)" : "");
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
