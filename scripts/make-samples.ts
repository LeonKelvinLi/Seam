/**
 * Synthesise sample footage so the product is usable and testable with zero real media:
 * vector scenes rendered frame-by-frame with a slow camera drift, encoded to 720p MP4.
 * Output: public/samples/<pair>-a.mp4, <pair>-b.mp4, posters, and manifest.json.
 * Real footage in the same folder (same names) simply replaces these.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { spawnSync } from "node:child_process";

const OUT = path.join(process.cwd(), "public", "samples");
const W = 1280, H = 720, FPS = 24, SEC = 2.5;

type Scene = (t: number) => string; // t in 0..1 -> SVG string

const rad = (id: string, c1: string, c2: string) => `<radialGradient id="${id}" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></radialGradient>`;
const lin = (id: string, c1: string, c2: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>`;
const wrap = (defs: string, body: string, zoom: number, dx = 0, dy = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 160 90"><defs>${defs}</defs><g transform="translate(80 45) scale(${zoom}) translate(${-80 + dx} ${-45 + dy})">${body}</g></svg>`;

const SCENES: Record<string, Scene> = {
  coffee: (t) => wrap(rad("g", "#7a4a28", "#1b100a"), `<rect width="160" height="90" fill="url(#g)"/><ellipse cx="80" cy="50" rx="34" ry="30" fill="#efe6d6"/><ellipse cx="80" cy="50" rx="28" ry="24" fill="#3b2314"/><ellipse cx="80" cy="50" rx="24" ry="20" fill="#5a3418"/><ellipse cx="${74 + t * 4}" cy="${46 - t * 3}" rx="6" ry="3" fill="#8a5a30" opacity="0.6"/><path d="M70 ${22 - t * 6} q4 -8 0 -14 M80 ${20 - t * 5} q4 -8 0 -14 M90 ${22 - t * 6} q4 -8 0 -14" stroke="#ffffff55" stroke-width="1.5" fill="none"/>`, 1 + t * 0.12),
  ocean: (t) => wrap(lin("g", "#2a7fb8", "#06263f"), `<rect width="160" height="90" fill="url(#g)"/><rect y="46" width="160" height="44" fill="#0d4d78"/><path d="M${-20 + t * 20} 60 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 v30 H-20z" fill="#1a6ea3"/><path d="M${-40 + t * 30} 70 q20 -4 40 0 t40 0 t40 0 t40 0 t40 0 v20 H-40z" fill="#2a86bd" opacity="0.8"/><circle cx="118" cy="26" r="9" fill="#ffe8b0" opacity="0.9"/>`, 1.1 - t * 0.1, 0, t * 2),
  wheel: (t) => wrap(rad("g", "#3a3a3d", "#0e0e10"), `<rect width="160" height="90" fill="url(#g)"/><circle cx="80" cy="46" r="34" fill="#1a1a1c"/><circle cx="80" cy="46" r="24" fill="#6d6d72"/><circle cx="80" cy="46" r="7" fill="#c9c9cc"/>${[0, 60, 120, 180, 240, 300].map((a) => `<rect x="78" y="24" width="4" height="22" fill="#2b2b2e" transform="rotate(${a + t * 140} 80 46)"/>`).join("")}`, 1 + t * 0.2),
  tunnel: (t) => wrap(rad("g", "#f0b35a", "#100904"), `<rect width="160" height="90" fill="#100904"/><circle cx="80" cy="45" r="${44 + t * 10}" fill="#4a2a10"/><circle cx="80" cy="45" r="${30 + t * 8}" fill="#8a4c1a"/><circle cx="80" cy="45" r="${16 + t * 6}" fill="url(#g)"/><circle cx="80" cy="45" r="${6 + t * 3}" fill="#fff2c0"/>`, 1),
  door: (t) => wrap(rad("g", "#4a3b2a", "#15100b"), `<rect width="160" height="90" fill="url(#g)"/><rect x="56" y="10" width="48" height="80" fill="#2a1e14"/><rect x="60" y="14" width="40" height="76" fill="#7a5a3a"/><rect x="64" y="20" width="32" height="66" fill="#8ec5e8"/><circle cx="94" cy="54" r="2" fill="#e0c070"/>`, 1 + t * 0.18),
  beach: (t) => wrap(lin("g", "#8ec5e8", "#1f6fa6"), `<rect width="160" height="90" fill="url(#g)"/><rect y="50" width="160" height="40" fill="#f2dfb3"/><path d="M${-20 + t * 10} 52 q40 6 80 0 t80 0 t80 0 v6 H-20z" fill="#3aa0d8"/><circle cx="30" cy="20" r="8" fill="#fff4cc"/>`, 1.08 - t * 0.08),
  phone: (t) => wrap(rad("g", "#2c2c30", "#0c0c0e"), `<rect width="160" height="90" fill="url(#g)"/><rect x="58" y="6" width="44" height="80" rx="7" fill="#1a1a1c" stroke="#555"/><rect x="62" y="12" width="36" height="68" rx="4" fill="#2f6fed"/><rect x="66" y="${18 - t * 6}" width="28" height="6" rx="2" fill="#ffffff66"/><rect x="66" y="${28 - t * 6}" width="20" height="4" rx="2" fill="#ffffff44"/><rect x="66" y="${40 - t * 6}" width="28" height="18" rx="3" fill="#ffffff22"/>`, 1 + t * 0.15),
  city: (t) => wrap(lin("g", "#3a4a7a", "#0b0f1e"), `<rect width="160" height="90" fill="url(#g)"/>${[0, 22, 40, 66, 90, 112, 134].map((x, i) => `<rect x="${x - t * 6}" y="${30 + (i % 3) * 12}" width="${18 + (i % 2) * 8}" height="60" fill="${i % 2 ? "#141a30" : "#1b2340"}"/>`).join("")}${Array.from({ length: 30 }).map((_, i) => `<rect x="${4 + ((i * 17) % 150) - t * 6}" y="${40 + ((i * 11) % 44)}" width="2" height="3" fill="#ffd27a" opacity="${0.5 + ((i * 7) % 5) / 10}"/>`).join("")}`, 1.06 - t * 0.06),
};

const PAIRS = [
  { id: "coffee-ocean", title: "Coffee → Ocean", a: "coffee", b: "ocean" },
  { id: "wheel-tunnel", title: "Car wheel → Tunnel", a: "wheel", b: "tunnel" },
  { id: "door-beach", title: "Door → Beach", a: "door", b: "beach" },
  { id: "phone-city", title: "Phone → City", a: "phone", b: "city" },
];

async function renderClip(scene: Scene, out: string) {
  const dir = fs.mkdtempSync(path.join(OUT, ".frames-"));
  const n = Math.round(FPS * SEC);
  for (let i = 0; i < n; i++) {
    const svg = scene(i / (n - 1));
    await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(path.join(dir, `f_${String(i).padStart(3, "0")}.jpg`));
  }
  const r = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(dir, "f_%03d.jpg"),
    "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.02:sample_rate=48000", "-t", String(SEC),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  fs.rmSync(dir, { recursive: true, force: true });
  await sharp(Buffer.from(scene(0.5))).resize(640).jpeg({ quality: 80 }).toFile(out.replace(/\.mp4$/, ".jpg"));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: { id: string; title: string; a: string; b: string }[] = [];
  for (const p of PAIRS) {
    const a = `${p.id}-a.mp4`, b = `${p.id}-b.mp4`;
    for (const [file, key] of [[a, p.a], [b, p.b]] as const) {
      const out = path.join(OUT, file);
      if (fs.existsSync(out) && !process.argv.includes("--force")) { console.log("keep", file); continue; }
      console.log("render", file);
      await renderClip(SCENES[key], out);
    }
    manifest.push({ id: p.id, title: p.title, a, b });
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("wrote", path.join(OUT, "manifest.json"));
}
main().catch((e) => { console.error(e); process.exit(1); });
