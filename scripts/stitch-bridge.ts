/**
 * Stitch one externally generated bridge (e.g. a Higgsfield render made from the exact cut frames) between the real
 * clips the way production does, and print the jolt/lurch at each join. The bridge keeps its own pacing unless a
 * speed-up is given: camera-move transitions read smoother near real time than squeezed into 2 s.
 *   npx tsx scripts/stitch-bridge.ts <a.mp4> <aCutSec> <bridge.mp4> <b.mp4> <bCutSec> <out.mp4> [speedup=1] [side=2.2]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg, normalizeBridge, probe, stitch } from "@/core/media/ffmpeg";
import { transitionSmoothness } from "@/core/quality/smoothness";

const [a, aCut, bridgeSrc, b, bCut, out, speedupArg, sideArg] = process.argv.slice(2);
const speedup = Number(speedupArg ?? 1), SIDE = Number(sideArg ?? 2.2), CROSSFADE = 0.2;
const spec = { width: 720, height: 1280, fps: 30 };
const cover = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},fps=${spec.fps},setsar=1`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seam-stitch-"));

async function part(src: string, from: number, dur: number, file: string) {
  await ffmpeg(["-ss", Math.max(0, from).toFixed(3), "-i", src, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", dur.toFixed(3), "-vf", cover, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
}

const aPart = path.join(tmp, "a.mp4"), bPart = path.join(tmp, "b.mp4"), bridge = path.join(tmp, "bridge.mp4");
await part(a, Number(aCut) - SIDE, SIDE, aPart);
await part(b, Number(bCut), SIDE + 0.8, bPart);
const src = (await probe(bridgeSrc)).durationSec;
const bSec = await normalizeBridge(bridgeSrc, bridge, spec, src / speedup, speedup, speedup > 1.15);
await stitch(aPart, bridge, bPart, out, spec, CROSSFADE);
const aSec = (await probe(aPart)).durationSec;
const m = await transitionSmoothness(out, spec.fps, [aSec - CROSSFADE / 2, aSec + bSec - 1.5 * CROSSFADE]);
console.log(JSON.stringify({ out, bridgeSourceSec: +src.toFixed(2), bridgeSec: +bSec.toFixed(2),
  joinIn: m.joinIn, joinOut: m.joinOut, jolt: +m.jolt.toFixed(2), lurch: +m.lurch.toFixed(2) }));
fs.rmSync(tmp, { recursive: true, force: true });
