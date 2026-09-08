/**
 * ffmpeg / ffprobe wrappers. Every function is a plain async call that produces a file on disk.
 * All footage is normalised to a "proxy" spec (same size, fps, pixfmt, audio layout) so that
 * later stages (xfade stitching, frame extraction, bridge normalisation) can assume uniform inputs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { logger } from "@/core/log";

const log = logger("ffmpeg");

export interface ProbeInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
  rotation: number;
}

export interface FrameSpec { width: number; height: number; fps: number }

function exec(bin: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = opts.timeoutMs ? setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${bin} timed out`)); }, opts.timeoutMs) : null;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.split("\n").filter(Boolean).slice(-6).join(" | ")}`));
    });
  });
}

export async function ffmpeg(args: string[], timeoutMs = 10 * 60_000) {
  log.debug("run", { args: args.join(" ") });
  return exec(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeoutMs });
}

export async function probe(file: string): Promise<ProbeInfo> {
  const { stdout } = await exec(config.ffprobePath, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const json = JSON.parse(stdout) as {
    streams: Array<Record<string, unknown> & { codec_type: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; tags?: Record<string, string>; side_data_list?: Array<{ rotation?: number }> }>;
    format: { duration?: string };
  };
  const v = json.streams.find((s) => s.codec_type === "video");
  const a = json.streams.find((s) => s.codec_type === "audio");
  let rotation = 0;
  if (v) {
    const tagRot = Number(v.tags?.rotate ?? 0);
    const sdRot = v.side_data_list?.find((s) => typeof s.rotation === "number")?.rotation ?? 0;
    rotation = ((Math.round((tagRot || sdRot) / 90) * 90) % 360 + 360) % 360;
  }
  const fpsStr = (v?.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v?.r_frame_rate) ?? "0/1";
  const [n, d] = fpsStr.split("/").map(Number);
  const fps = d ? n / d : n;
  let width = v?.width ?? 0, height = v?.height ?? 0;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  const duration = Number(json.format?.duration ?? (v?.duration as string | undefined) ?? 0);
  return { durationSec: Number.isFinite(duration) ? duration : 0, width, height, fps: fps || 0, hasAudio: !!a, hasVideo: !!v, rotation };
}

/** Choose the delivery frame from the start clip's orientation: 9:16 for portrait, 16:9 otherwise, 1:1 for squares. */
export function chooseOutputFrame(w: number, h: number): { width: number; height: number } {
  const maxEdge = config.output.maxEdge;
  if (!w || !h) return { width: maxEdge, height: Math.round((maxEdge * 9) / 16) };
  const r = w / h;
  if (r < 0.8) return { width: Math.round(maxEdge * 9 / 16 / 2) * 2, height: maxEdge };
  if (r > 1.25) return { width: maxEdge, height: Math.round(maxEdge * 9 / 16 / 2) * 2 };
  const s = Math.round(maxEdge * 0.75 / 2) * 2;
  return { width: s, height: s };
}

/** Scale to fit inside the frame, and fill the remaining area with a blurred, darkened copy of the footage. */
function fitFilter(w: number, h: number): string {
  return (
    `split[bg][fg];` +
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=40,eq=brightness=-0.15[bgb];` +
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];` +
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p`
  );
}

/** Normalise any video into the proxy spec. Always emits an audio track (silent if the source has none). */
export async function makeProxy(input: string, output: string, spec: FrameSpec, hasAudio: boolean, maxDurationSec?: number) {
  const args = ["-i", input];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  args.push(
    "-filter_complex", `[0:v]${fitFilter(spec.width, spec.height)},fps=${spec.fps},setsar=1[v]`,
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(spec.fps),
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k",
    "-movflags", "+faststart",
  );
  if (maxDurationSec) args.push("-t", String(maxDurationSec));
  else if (!hasAudio) args.push("-shortest");
  args.push(output);
  await ffmpeg(args);
  return output;
}

/** Turn a still image into footage with a gentle push (Ken Burns), in the proxy spec, with silent audio. */
export async function imageToClip(image: string, output: string, spec: FrameSpec, durationSec: number, zoom: "in" | "out" = "in") {
  const frames = Math.round(durationSec * spec.fps);
  const z = zoom === "in" ? `1+0.08*on/${frames}` : `1.08-0.08*on/${frames}`;
  const filter =
    `[0:v]scale=${spec.width * 2}:${spec.height * 2}:force_original_aspect_ratio=increase,crop=${spec.width * 2}:${spec.height * 2},` +
    `zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${spec.width}x${spec.height}:fps=${spec.fps},format=yuv420p,setsar=1[v]`;
  await ffmpeg([
    "-i", image, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex", filter, "-map", "[v]", "-map", "1:a:0",
    "-frames:v", String(frames), "-t", String(durationSec),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(spec.fps),
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output,
  ]);
  return output;
}

/** A still frame, zooming (or panning) toward a point. Used by the local bridge provider. */
export async function stillWithMove(
  image: string, output: string, spec: FrameSpec, durationSec: number,
  move: { zoomFrom: number; zoomTo: number; fx: number; fy: number; panX?: number; panY?: number },
) {
  const frames = Math.max(2, Math.round(durationSec * spec.fps));
  const W = spec.width * 2, H = spec.height * 2; // upscale first so zoompan stays crisp
  const z = `${move.zoomFrom}+(${move.zoomTo}-${move.zoomFrom})*on/${frames - 1}`;
  const px = move.panX ?? 0, py = move.panY ?? 0;
  const x = `(iw-iw/zoom)*(${move.fx}+${px}*on/${frames - 1})`;
  const y = `(ih-ih/zoom)*(${move.fy}+${py}*on/${frames - 1})`;
  const filter =
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `zoompan=z='${z}':d=${frames}:x='${x}':y='${y}':s=${spec.width}x${spec.height}:fps=${spec.fps},format=yuv420p,setsar=1[v]`;
  await ffmpeg([
    "-i", image, "-filter_complex", filter, "-map", "[v]", "-frames:v", String(frames),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(spec.fps), "-an", output,
  ]);
  return output;
}

/** Blend two same-spec silent clips with an ffmpeg xfade transition across their full length. */
export async function xfadeClips(a: string, b: string, output: string, spec: FrameSpec, transition: string, durationSec: number, blur = 0) {
  const post = blur > 0 ? `,gblur=sigma=${blur}` : "";
  const filter = `[0:v][1:v]xfade=transition=${transition}:duration=${durationSec.toFixed(3)}:offset=0${post},format=yuv420p[v]`;
  await ffmpeg([
    "-i", a, "-i", b, "-filter_complex", filter, "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(spec.fps), "-an", output,
  ]);
  return output;
}

export interface ExtractedFrameFile { t: number; path: string }

/** Extract frames between start and end seconds at the given fps. Returns absolute timestamps. */
export async function extractFrames(video: string, outDir: string, startSec: number, endSec: number, fps: number, prefix = "f"): Promise<ExtractedFrameFile[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const dur = Math.max(0.05, endSec - startSec);
  const pattern = path.join(outDir, `${prefix}_%03d.jpg`);
  await ffmpeg(["-ss", startSec.toFixed(3), "-t", dur.toFixed(3), "-i", video, "-vf", `fps=${fps}`, "-q:v", "2", "-start_number", "0", pattern]);
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith(prefix + "_") && f.endsWith(".jpg")).sort();
  return files.map((f) => {
    const i = Number(f.slice(prefix.length + 1, -4));
    return { t: startSec + i / fps, path: path.join(outDir, f) };
  });
}

/** Extract one frame. Seeking onto the very last frame can yield nothing, so step back and retry. */
export async function extractFrameAt(video: string, t: number, output: string) {
  fs.rmSync(output, { force: true });
  // A request at or past the last frame (t == duration after time-remapping) makes ffmpeg exit non-zero with an
  // empty output; each candidate is tried in turn and the final one seeks from the end of the file.
  const candidates: string[][] = [t, t - 0.08, t - 0.25, 0].map((tt) => ["-ss", Math.max(0, tt).toFixed(3), "-i", video]);
  candidates.splice(1, 0, ["-sseof", "-0.05", "-i", video]);
  let lastError: unknown = null;
  for (const input of candidates) {
    try {
      await ffmpeg([...input, "-frames:v", "1", "-q:v", "2", output]);
    } catch (e) { lastError = e; }
    if (fs.existsSync(output) && fs.statSync(output).size > 0) return output;
  }
  throw new Error(`could not extract a frame at ${t.toFixed(2)}s from ${path.basename(video)}${lastError ? `: ${(lastError as Error).message.slice(0, 120)}` : ""}`);
}

/** Frames at evenly spaced fractions of a clip (used by the quality judge). */
export async function sampleFrames(video: string, outDir: string, count: number, prefix = "s"): Promise<ExtractedFrameFile[]> {
  const info = await probe(video);
  fs.mkdirSync(outDir, { recursive: true });
  const out: ExtractedFrameFile[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : Math.min(info.durationSec - 1 / (info.fps || 30), (info.durationSec * i) / (count - 1));
    const p = path.join(outDir, `${prefix}_${i}.jpg`);
    await extractFrameAt(video, Math.max(0, t), p);
    out.push({ t, path: p });
  }
  return out;
}

/** Frame-accurate trim with re-encode, keeping the proxy spec. */
export async function trimClip(input: string, output: string, startSec: number | null, endSec: number | null, spec: FrameSpec) {
  const args = ["-i", input];
  const vf = `fps=${spec.fps},format=yuv420p`;
  if (startSec !== null) args.push("-ss", startSec.toFixed(3));
  if (endSec !== null) args.push("-to", endSec.toFixed(3));
  args.push("-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(spec.fps),
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output);
  await ffmpeg(args);
  return output;
}

/**
 * Bring a provider-generated bridge into the proxy spec and time-remap it to the target duration
 * (models emit 5-10s clips; transitions want ~1-2s). Adds a silent audio track.
 */
export async function normalizeBridge(input: string, output: string, spec: FrameSpec, targetDurationSec: number) {
  const info = await probe(input);
  const factor = info.durationSec > 0 ? targetDurationSec / info.durationSec : 1;
  const filter = `[0:v]${fitFilter(spec.width, spec.height)},setpts=${factor.toFixed(5)}*PTS,fps=${spec.fps},setsar=1[v]`;
  await ffmpeg([
    "-i", input, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex", filter, "-map", "[v]", "-map", "1:a:0", "-t", targetDurationSec.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(spec.fps),
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output,
  ]);
  return output;
}

/** Add a silent audio track to a silent video without re-encoding video. */
export async function addSilentAudio(input: string, output: string) {
  await ffmpeg([
    "-i", input, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", output,
  ]);
  return output;
}

/**
 * Stitch A + bridge + B with a short video crossfade and audio crossfade at each seam.
 * All three inputs must already be in the proxy spec (same size/fps, stereo 48k audio).
 */
export async function stitch(a: string, bridge: string, b: string, output: string, spec: FrameSpec, crossfadeSec: number) {
  const [ia, ib, ic] = await Promise.all([probe(a), probe(bridge), probe(b)]);
  const d = Math.min(crossfadeSec, ia.durationSec / 2, ib.durationSec / 2, ic.durationSec / 2);
  const off1 = Math.max(0, ia.durationSec - d);
  const off2 = Math.max(0, ia.durationSec + ib.durationSec - 2 * d);
  const filter =
    `[0:v][1:v]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${off1.toFixed(3)}[v1];` +
    `[v1][2:v]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${off2.toFixed(3)},format=yuv420p[v];` +
    `[0:a][1:a]acrossfade=d=${d.toFixed(3)}:c1=tri:c2=tri[a1];` +
    `[a1][2:a]acrossfade=d=${d.toFixed(3)}:c1=tri:c2=tri[a]`;
  await ffmpeg([
    "-i", a, "-i", bridge, "-i", b, "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(spec.fps),
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output,
  ]);
  return output;
}

/** Poster frame (jpg) for a video. */
export async function poster(video: string, output: string, t = 0) {
  return extractFrameAt(video, t, output);
}

export async function download(url: string, output: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(output, buf);
  return output;
}
