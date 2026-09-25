/**
 * Before/after for bridge retiming: stitch real clip pairs around their real MiniMax renders the way production does
 * (A + bridge + B, short crossfades), once with the old constant speed-up and once with the speed ramp, and measure
 * the jolt and lurch at each join (src/core/quality/smoothness.ts). Writes side-by-side videos (left old, right new).
 * 2026-09-25: ramp + 0.2 s dissolve cut the worst jolt per pair from 2.98/2.43/1.64/3.40 to 1.60/1.22/1.51/1.80.
 * A motion-matched per-frame retime was also tried and lost to the ramp: frame difference mixes morphing with motion.
 *   npx tsx scripts/smoothness-bench.ts [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, normalizeBridge, probe, stitch } from "@/core/media/ffmpeg";
import { transitionSmoothness } from "@/core/quality/smoothness";

const OUT = path.resolve(process.argv[2] || "data/live-results/smoothness-bench");
fs.mkdirSync(OUT, { recursive: true });
const spec = { width: 720, height: 1280, fps: 30 };
const R = "data/ads/real";
// Cut points are where each render's first and last frames were taken from (data/ads/motion/clipmelt-chain-916.json).
const PAIRS = [
  { id: "skate-bmx", a: `${R}/p2_b_skate.mp4`, aCut: 3.3, bridge: `${R}/v3_morph.mp4`, b: `${R}/bmx_sky_39055942.mp4`, bCut: 4.4 },
  { id: "surf-skate", a: `${R}/p1_b_surf.mp4`, aCut: 7.0, bridge: `${R}/v4_envmorph_b.mp4`, b: `${R}/p2_b_skate.mp4`, bCut: 0 },
  { id: "cliff-surf", a: `${R}/p1_a_cliff.mp4`, aCut: 2.4, bridge: `${R}/v5_dive.mp4`, b: `${R}/p1_b_surf.mp4`, bCut: 0 },
  { id: "bmx-para", a: `${R}/bmx_sky_39055942.mp4`, aCut: 7.3, bridge: `${R}/v3_fpv.mp4`, b: `${R}/paraglide_pov_12803095.mp4`, bCut: 8.0 },
];
const SIDE = 2.2, CROSSFADE = Number(process.env.BENCH_CROSSFADE ?? 0.12);
const cover = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},fps=${spec.fps},setsar=1`;

async function part(src: string, from: number, dur: number, out: string) {
  await ffmpeg(["-ss", Math.max(0, from).toFixed(3), "-i", src, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", dur.toFixed(3), "-vf", cover, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]);
}

const rows: string[] = [];
for (const p of PAIRS) {
  const dir = path.join(OUT, p.id);
  fs.mkdirSync(dir, { recursive: true });
  const aPart = path.join(dir, "a.mp4"), bPart = path.join(dir, "b.mp4");
  await part(p.a, p.aCut - SIDE, SIDE, aPart);
  await part(p.b, p.bCut, SIDE, bPart);
  const aSec = (await probe(aPart)).durationSec;
  const results: Record<string, { jolt: number; lurch: number; file: string }> = {};
  for (const tag of (process.env.BENCH_MODES ?? "linear,ramp").split(",") as ("linear" | "ramp")[]) {
    const bridge = path.join(dir, `bridge_${tag}.mp4`), full = path.join(dir, `full_${tag}.mp4`);
    const bSec = await normalizeBridge(p.bridge, bridge, spec, 2.0, 2.5, tag === "ramp");
    await stitch(aPart, bridge, bPart, full, spec, CROSSFADE);
    const joins: [number, number] = [aSec - CROSSFADE / 2, aSec + bSec - 1.5 * CROSSFADE];
    const m = await transitionSmoothness(full, spec.fps, joins);
    results[tag] = { jolt: m.jolt, lurch: m.lurch, file: full };
    rows.push(`${p.id.padEnd(11)} ${tag.padEnd(6)} jolt in ${m.joinIn.jolt.toFixed(2)} out ${m.joinOut.jolt.toFixed(2)} | lurch in ${m.joinIn.lurch.toFixed(2)} out ${m.joinOut.lurch.toFixed(2)}`);
  }
  if (results.linear && results.ramp) await ffmpeg(["-i", results.linear.file, "-i", results.ramp.file, "-filter_complex",
    "[0:v]scale=360:640[l];[1:v]scale=360:640[r];[l][r]hstack=inputs=2,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "20", path.join(OUT, `${p.id}_old-vs-new.mp4`)]);
}
console.log(rows.join("\n"));
