#!/usr/bin/env node
/**
 * Import real AI bridges as library style previews.
 *
 *   node scripts/import-library-previews.mjs previews.json
 *
 * previews.json maps a recipe id to a finished AI bridge (an https URL or a local file):
 *   { "orbit": "https://…/result.mp4", "portal-tv": "/path/to/bridge.mp4" }
 *
 * Each clip is re-encoded to the preview spec (1280x720, 30 fps, H.264, no audio, faststart) into
 * public/library-ai/<id>.mp4, then allowlisted in .dockerignore and pinned in docs/deploy-assets.json,
 * which the Docker build verifies byte for byte. Only offered (seamless) recipe ids are accepted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const mappingPath = process.argv[2];
if (!mappingPath) {
  console.error("usage: node scripts/import-library-previews.mjs previews.json");
  process.exit(1);
}
const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

// The seamless allow-list lives in TypeScript; read the ids straight from the source so this stays in sync.
const registry = fs.readFileSync(path.join(root, "src/core/recipes/registry.ts"), "utf8");
const listBody = registry.match(/SEAMLESS_RECIPE_IDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
const offered = new Set([...listBody.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));
if (!offered.size) throw new Error("could not read SEAMLESS_RECIPE_IDS from registry.ts");

const outDir = path.join(root, "public", "library-ai");
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seam-previews-"));

const written = [];
for (const [id, source] of Object.entries(mapping)) {
  if (!offered.has(id)) throw new Error(`${id} is not an offered seamless recipe`);
  let input = source;
  if (/^https:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${id}: download failed with ${res.status}`);
    input = path.join(tmp, `${id}.src.mp4`);
    fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));
  }
  if (!fs.existsSync(input)) throw new Error(`${id}: source not found: ${source}`);
  const out = path.join(outDir, `${id}.mp4`);
  execFileSync(ffmpeg, [
    "-v", "error", "-y", "-i", input, "-an",
    "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
  ]);
  written.push(`public/library-ai/${id}.mp4`);
  console.log(`  ${id} -> public/library-ai/${id}.mp4 (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
}

// Pin every written file in the deploy manifest (replace entries with the same path).
const manifestPath = path.join(root, "docs", "deploy-assets.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const rel of written) {
  const bytes = fs.readFileSync(path.join(root, rel));
  const entry = { path: rel, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  const i = manifest.files.findIndex((f) => f.path === rel);
  if (i >= 0) manifest.files[i] = { ...manifest.files[i], ...entry };
  else manifest.files.push(entry);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// Allowlist the directory and each file in the deny-by-default .dockerignore.
const ignorePath = path.join(root, ".dockerignore");
const lines = fs.readFileSync(ignorePath, "utf8").split("\n");
for (const want of ["!public/library-ai/", ...written.map((p) => `!${p}`)]) {
  if (!lines.includes(want)) lines.splice(lines.lastIndexOf("") >= 0 ? lines.lastIndexOf("") : lines.length, 0, want);
}
fs.writeFileSync(ignorePath, lines.join("\n").replace(/\n*$/, "\n"));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Imported ${written.length} preview(s); manifest and .dockerignore updated. Run: node docs/verify-deploy-assets.mjs`);
