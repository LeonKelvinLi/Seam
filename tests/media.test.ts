import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpeg, probe, extractFrames, stillWithMove, xfadeClips, normalizeBridge, stitch, makeProxy, extractFrameAt } from "@/core/media/ffmpeg";
import { config } from "@/core/config";
import { computeFeatures, loadRasters } from "@/core/analysis/features";
import sharp from "sharp";
import { heuristicJudge } from "@/core/quality/heuristic-judge";

const spec = { width: 320, height: 180, fps: 24 };
// ffprobe prints seconds rounded to six decimal places; allow that rounding at a one-frame boundary.
const frameDurationTolerance = 1 / spec.fps + 0.000001;
const run = promisify(execFile);

async function streamDurations(file: string) {
  const { stdout } = await run(config.ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", file]);
  const { streams } = JSON.parse(stdout) as { streams: { codec_type: string; duration: string }[] };
  return Object.fromEntries(streams.map((stream) => [stream.codec_type, Number(stream.duration)]));
}

test("ffmpeg pipeline: proxy, frames, features, procedural bridge, stitch, judge", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-"));
  const src = path.join(dir, "src.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "2", "-pix_fmt", "yuv420p", src]);
  const info = await probe(src);
  assert.ok(Math.abs(info.durationSec - 2) < 0.1 && info.width === 640 && !info.hasAudio);
  const proxy = path.join(dir, "proxy.mp4");
  await makeProxy(src, proxy, spec, false);
  const pi = await probe(proxy);
  assert.equal(pi.width, 320); assert.ok(pi.hasAudio, "proxy always has audio");
  const proxyStreams = await streamDurations(proxy);
  assert.ok(Math.abs(proxyStreams.audio - proxyStreams.video) <= frameDurationTolerance, `proxy audio/video durations ${proxyStreams.audio}/${proxyStreams.video}`);
  assert.ok(Math.abs(pi.durationSec - info.durationSec) <= frameDurationTolerance, `proxy preserves source duration: ${pi.durationSec}`);
  const frames = await extractFrames(proxy, path.join(dir, "frames"), 0.5, 2, 6, "t");
  assert.ok(frames.length >= 6 && frames[0].t >= 0.5);
  const r0 = await loadRasters(frames[0].path), r1 = await loadRasters(frames[1].path);
  const f = computeFeatures(r1, r0);
  assert.ok(f.sharpness > 0 && f.dominantColors.length === 3 && f.motion >= 0);
  const fa = path.join(dir, "a.jpg"), fb = path.join(dir, "b.jpg");
  await extractFrameAt(proxy, 1.9, fa); await extractFrameAt(proxy, 0.1, fb);
  const ca = path.join(dir, "ca.mp4"), cb = path.join(dir, "cb.mp4"), bridge = path.join(dir, "bridge.mp4");
  await stillWithMove(fa, ca, spec, 1.0, { zoomFrom: 1, zoomTo: 1.5, fx: 0.5, fy: 0.5 });
  await stillWithMove(fb, cb, spec, 1.0, { zoomFrom: 1.5, zoomTo: 1, fx: 0.5, fy: 0.5 });
  await xfadeClips(ca, cb, bridge, spec, "fade", 1.0);
  const bi = await probe(bridge);
  assert.ok(Math.abs(bi.durationSec - 1.0) < 0.15, `bridge duration ${bi.durationSec}`);
  const norm = path.join(dir, "norm.mp4");
  await normalizeBridge(bridge, norm, spec, 0.8);
  const ni = await probe(norm);
  assert.ok(Math.abs(ni.durationSec - 0.8) < 0.15 && ni.hasAudio, `normalized ${ni.durationSec}`);
  // A 5 s render asked to fit 0.8 s would play 6x fast; with a 2.5x cap it stops at 2 s.
  const render = path.join(dir, "render5.mp4"), capped = path.join(dir, "capped.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=320x180:rate=24", "-t", "5", "-pix_fmt", "yuv420p", render]);
  assert.equal(await normalizeBridge(render, capped, spec, 0.8, 2.5), 2);
  assert.ok(Math.abs((await probe(capped)).durationSec - 2) < 0.1, `capped ${(await probe(capped)).durationSec}`);
  // A render a few percent wider than the project (H3 Max: 1344x768) fills the frame; it is not padded with dark bars.
  const wide = path.join(dir, "wide.mp4"), filled = path.join(dir, "filled.mp4"), edge = path.join(dir, "edge.png");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=white:size=1344x768:rate=24", "-t", "1", "-pix_fmt", "yuv420p", wide]);
  await normalizeBridge(wide, filled, spec, 1);
  await ffmpeg(["-i", filled, "-frames:v", "1", "-vf", "crop=8:ih:0:0", edge]);
  const { data } = await sharp(edge).greyscale().raw().toBuffer({ resolveWithObject: true });
  const leftEdge = data.reduce((sum, v) => sum + v, 0) / data.length;
  assert.ok(leftEdge > 245, `left edge luma ${leftEdge.toFixed(0)}`);
  const full = path.join(dir, "full.mp4");
  await stitch(proxy, norm, proxy, full, spec, 0.12);
  const fi = await probe(full);
  assert.ok(Math.abs(fi.durationSec - (2 + 0.8 + 2 - 0.24)) < 0.2, `full ${fi.durationSec}`);
  const fullStreams = await streamDurations(full);
  assert.ok(Math.abs(fullStreams.video - (2 + 0.8 + 2 - 0.24)) < 0.2, `full video ${fullStreams.video}`);
  assert.ok(Math.abs(fullStreams.audio - fullStreams.video) <= 2 * frameDurationTolerance, `full audio/video durations ${fullStreams.audio}/${fullStreams.video}`);
  const q = await heuristicJudge(norm, fa, fb, dir);
  assert.ok(q.startFidelity > 50 && q.endFidelity > 50, `fidelity ${q.startFidelity}/${q.endFidelity}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
