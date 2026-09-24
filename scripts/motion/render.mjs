/**
 * Motion-ad renderer: HTML/CSS compositions stepped frame by frame in headless Chrome, encoded with ffmpeg,
 * then scored with a music bed, synthesized SFX and a two-pass loudness normalisation.
 *
 *   node scripts/motion/render.mjs data/ads/motion/<spec>.json            full render -> public/ads/<id>.mp4
 *   node scripts/motion/render.mjs <spec> --still 2.7,5.9                 PNG stills for layout review
 *   node scripts/motion/render.mjs <spec> --copy es                       render with an alternate copy deck (localisation)
 *   node scripts/motion/render.mjs <spec> --audio-only                    re-score the last render without re-rendering frames
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { launch } from "./cdp.mjs";

const ROOT = process.cwd();
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "/opt/homebrew/bin/ffprobe";
const args = process.argv.slice(2);
const specPath = args.find((a) => a.endsWith(".json"));
if (!specPath) { console.error("usage: render.mjs <spec.json> [--still t1,t2] [--copy lang]"); process.exit(1); }
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const lang = flag("--copy");
if (lang) { spec.copy = { ...spec.copy, ...(spec.copies?.[lang] ?? {}) }; spec.id = `${spec.id}-${lang}`; }
const TMP = path.join(ROOT, "data", "ads-tmp", "motion");
const CACHE = path.join(TMP, "cache");
const WORK = path.join(TMP, spec.id);
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const run = (bin, a) => execFileSync(bin, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
const probeDur = (f) => parseFloat(run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

// 1. Clip frames (cached per source + width).
const clipFrames = {};
for (const [name, c] of Object.entries(spec.clips || {})) {
  const src = path.join(ROOT, c.src);
  const w = c.width || spec.clipWidth || 1920;
  // Clips may keep their native rate (e.g. 24 fps generations) so frames are not duplicated at extraction.
  const fps = c.fps || spec.fps;
  const key = `${path.basename(path.dirname(src))}_${path.basename(src, path.extname(src))}_${w}${c.fps ? `_${c.fps}fps` : ""}`.replace(/[^\w.-]/g, "_");
  const dir = path.join(CACHE, key);
  const stamp = path.join(dir, ".ok");
  if (!fs.existsSync(stamp) || fs.statSync(stamp).mtimeMs < fs.statSync(src).mtimeMs) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    run(FFMPEG, ["-y", "-loglevel", "error", "-i", src, "-vf", `fps=${fps},scale=${w}:-2:flags=lanczos,unsharp=5:5:0.35:5:5:0`, "-q:v", "2", path.join(dir, "%05d.jpg")]);
    fs.writeFileSync(stamp, src);
  }
  const count = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
  clipFrames[name] = { dir: path.relative(WORK, dir), count, fps };
}
const images = {};
for (const [name, rel] of Object.entries(spec.images || {})) images[name] = path.relative(WORK, path.join(ROOT, rel));

// 2. Composition page (runtime + timeline inlined; frames referenced relatively).
const runtime = fs.readFileSync(path.join(ROOT, "scripts/motion/runtime.js"), "utf8");
const timeline = fs.readFileSync(path.join(ROOT, "scripts/motion/timelines", `${spec.timeline}.js`), "utf8");
const pageSpec = { ...spec, clipFrames, images };
fs.writeFileSync(path.join(WORK, "page.html"), `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
</style></head><body><div id="stage"></div>
<svg width="0" height="0" style="position:absolute"><defs id="fx-defs"></defs></svg>
<script>window.SPEC=${JSON.stringify(pageSpec)};</script>
<script>${runtime}</script>
<script>${timeline}</script>
</body></html>`);

const total = Math.round(spec.duration * spec.fps);
// --audio-only re-scores an existing render (reuses the silent video from the last full render).
const audioOnly = args.includes("--audio-only") && fs.existsSync(path.join(WORK, "video.mp4"));
const browser = audioOnly ? null : await launch({ width: spec.width, height: spec.height, scale: 1 });
if (browser) try {
  await browser.goto(`file://${path.join(WORK, "page.html")}`, 300);
  await browser.eval("document.fonts.ready.then(() => true)");

  const stills = flag("--still");
  if (stills) {
    for (const t of stills.split(",").map(Number)) {
      await browser.eval(`renderFrame(${t})`);
      const out = path.join(WORK, `still_${t.toFixed(2)}.png`);
      await browser.screenshot(out, { format: "png" });
      console.log(out);
    }
    await browser.close(); // process.exit skips the finally below
    process.exit(0);
  }

  // 3. Frames -> ffmpeg.
  const silent = path.join(WORK, "video.mp4");
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(spec.fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(spec.fps), "-movflags", "+faststart", silent], { stdio: ["pipe", "ignore", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / spec.fps;
    await browser.eval(`renderFrame(${t.toFixed(5)})`);
    const buf = await browser.screenshot(null, { format: "jpeg", quality: 97 });
    if (!ff.stdin.write(buf)) await once(ff.stdin, "drain");
    if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await once(ff, "exit");
  console.log(`\rframes done in ${((Date.now() - t0) / 1000).toFixed(0)}s              `);
} finally {
  await browser.close();
}

// 4. Audio: music bed + synthesized SFX, two-pass loudness to the spec target (Higgsfield master measured -12.9 LUFS).
const SFX = {
  whoosh: ["anoisesrc=d=0.5:c=pink:r=48000:a=0.9,highpass=f=350,lowpass=f=7000,afade=t=in:st=0:d=0.24:curve=exp,afade=t=out:st=0.24:d=0.26:curve=exp"],
  whoosh_long: ["anoisesrc=d=0.9:c=pink:r=48000:a=0.9,highpass=f=250,lowpass=f=6000,afade=t=in:st=0:d=0.5:curve=exp,afade=t=out:st=0.5:d=0.4:curve=exp"],
  impact: ["aevalsrc=0.95*sin(2*PI*(38+80*exp(-t*14))*t)*exp(-t*3.2)+0.35*(random(0)*2-1)*exp(-t*30):d=1.4:s=48000"],
  sub: ["aevalsrc=0.9*sin(2*PI*(62*exp(-t*0.9))*t)*exp(-t*1.7):d=1.6:s=48000"],
  riser: ["aevalsrc=0.28*sin(2*PI*(180+700*t*t)*t)*t+0.22*(random(0)*2-1)*t*t:d=1.2:s=48000,highpass=f=400"],
  tick: ["aevalsrc=0.55*sin(2*PI*2600*t)*exp(-t*90):d=0.07:s=48000"],
  click: ["aevalsrc=0.8*sin(2*PI*1800*t)*exp(-t*60)+0.3*sin(2*PI*4200*t)*exp(-t*120):d=0.09:s=48000"],
  swell: ["anoisesrc=d=1.0:c=pink:r=48000:a=0.8,lowpass=f=3500,afade=t=in:st=0:d=0.95:curve=exp"],
  // Foley-ish beds for real footage: wind on a cliff edge, a water entry, the muffled rumble under the surface, a screen tap.
  wind: ["anoisesrc=d=2.6:c=pink:r=48000:a=0.5,highpass=f=260,lowpass=f=2600,tremolo=f=0.45:d=0.5,afade=t=in:st=0:d=0.25,afade=t=out:st=1.6:d=0.7"],
  splash: ["aevalsrc=0.6*(random(0)*2-1)*(1-exp(-t*300))*exp(-t*3.6)+0.85*sin(2*PI*(75*exp(-t*7)+36)*t)*exp(-t*7.5):d=1.4:s=48000,highpass=f=30,lowpass=f=8500"],
  underwater: ["anoisesrc=d=1.9:c=brown:r=48000:a=0.8,lowpass=f=320,afade=t=in:st=0:d=0.25,afade=t=out:st=1.5:d=0.4"],
  tap: ["aevalsrc=0.5*sin(2*PI*900*t)*exp(-t*70)+0.25*(random(0)*2-1)*exp(-t*160):d=0.08:s=48000"],
  // End sting (two rising synth blips) and a digital glitch burst, for the TikTok-style outro.
  sting: ["aevalsrc=0.5*sin(2*PI*(560+420*exp(-t*30))*t)*exp(-t*14):d=0.25:s=48000[a];aevalsrc=0.45*sin(2*PI*(1120-260*exp(-t*25))*t)*exp(-t*5.5):d=0.9:s=48000,adelay=140|140[b];[a][b]amix=inputs=2:duration=longest:normalize=0[out0]"],
  glitch: ["anoisesrc=d=0.14:c=white:r=48000:a=0.45,highpass=f=1800,tremolo=f=45:d=0.9,afade=t=out:st=0.03:d=0.11"],
};
const sfxDir = path.join(CACHE, "sfx");
fs.mkdirSync(sfxDir, { recursive: true });
// Cache key includes the definition, so editing a sound regenerates it.
const sfxFile = (kind) => path.join(sfxDir, `${kind}_${crypto.createHash("md5").update(SFX[kind][0]).digest("hex").slice(0, 8)}.wav`);
for (const kind of new Set((spec.sfx || []).map((s) => s.kind))) {
  if (!SFX[kind]) throw new Error(`unknown sfx kind ${kind}`);
  if (!fs.existsSync(sfxFile(kind))) run(FFMPEG, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", SFX[kind][0], "-ac", "2", "-ar", "48000", sfxFile(kind)]);
}
const inputs = [];
const parts = [];
const m = spec.music;
// Music bed: one or more segments of the track placed on the timeline. A segment can be reversed and sped up
// (tape-style, pitch rises with speed), which is how the "rewind" is scored.
const segs = m.segments || [{ from: m.offset || 0, at: 0, dur: spec.duration, fadeIn: m.fadeIn ?? 0.02, fadeOut: m.fadeOut ?? 0.5 }];
segs.forEach((g, i) => {
  const speed = g.speed || 1;
  inputs.push("-ss", String(g.from), "-t", String(g.dur * speed), "-i", path.join(ROOT, g.src || m.src));
  const chain = ["aresample=48000", "asetpts=PTS-STARTPTS"];
  if (g.reverse) chain.push("areverse");
  if (speed !== 1) chain.push(`asetrate=${Math.round(48000 * speed)}`, "aresample=48000");
  chain.push(`volume=${(m.gainDb ?? 0) + (g.gainDb ?? 0)}dB`, `afade=t=in:st=0:d=${g.fadeIn ?? 0.01}`,
    `afade=t=out:st=${Math.max(0, g.dur - (g.fadeOut ?? 0.03)).toFixed(3)}:d=${g.fadeOut ?? 0.03}`);
  const ms = Math.max(0, Math.round((g.at || 0) * 1000));
  if (ms) chain.push(`adelay=${ms}|${ms}`);
  parts.push(`[${i}:a]${chain.join(",")}[m${i}]`);
});
parts.push(`${segs.map((_, i) => `[m${i}]`).join("")}amix=inputs=${segs.length}:normalize=0:duration=longest,apad=whole_dur=${spec.duration}[musraw]`);
// Optional "muffle" ranges: the bed crossfades to a low-passed copy (e.g. while the camera is under water).
if (m.muffle?.length) {
  const k = m.muffle.map((r) => { const ramp = r.ramp ?? 0.12; return `min(max((t-${r.from})/${ramp},0),1)*min(max((${r.to}-t)/${ramp},0),1)`; }).join("+");
  const hz = m.muffleHz ?? 420;
  parts.push("[musraw]asplit=2[mdry][mwet]",
    `[mwet]lowpass=f=${hz},lowpass=f=${hz},volume='(${k})*${Math.pow(10, (m.muffleGainDb ?? 4) / 20).toFixed(3)}':eval=frame[mwet2]`,
    `[mdry]volume='1-(${k})':eval=frame[mdry2]`, "[mdry2][mwet2]amix=inputs=2:normalize=0[mus]");
} else {
  parts.push("[musraw]anull[mus]");
}
const labels = ["[mus]"];
(spec.sfx || []).forEach((s, i) => {
  inputs.push("-i", sfxFile(s.kind));
  const ms = Math.max(0, Math.round(s.at * 1000));
  parts.push(`[${segs.length + i}:a]adelay=${ms}|${ms},volume=${s.gainDb ?? -8}dB[s${i}]`);
  labels.push(`[s${i}]`);
});
parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,alimiter=limit=0.93:level=false[mix]`);
const mixWav = path.join(WORK, "mix.wav");
run(FFMPEG, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[mix]", "-t", String(spec.duration), "-ac", "2", "-ar", "48000", mixWav]);
const target = spec.loudness ?? -13;
const measure = spawn(FFMPEG, ["-hide_banner", "-i", mixWav, "-af", `loudnorm=I=${target}:TP=-1.0:LRA=7:print_format=json`, "-f", "null", "-"]);
let log = ""; measure.stderr.on("data", (d) => (log += d));
await once(measure, "exit");
const meas = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
const finalWav = path.join(WORK, "final.wav");
run(FFMPEG, ["-y", "-loglevel", "error", "-i", mixWav, "-af",
  `loudnorm=I=${target}:TP=-1.0:LRA=7:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true`,
  "-ar", "48000", finalWav]);

// 5. Mux + QA sheet.
fs.mkdirSync(path.join(ROOT, "public", "ads"), { recursive: true });
const out = path.join(ROOT, "public", "ads", `${spec.id}.mp4`);
run(FFMPEG, ["-y", "-loglevel", "error", "-i", path.join(WORK, "video.mp4"), "-i", finalWav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", out]);
const cols = spec.width > spec.height ? 6 : 10;
run(FFMPEG, ["-y", "-loglevel", "error", "-i", out, "-vf", `fps=4,scale=${spec.width > spec.height ? 320 : 180}:-2,tile=${cols}x${Math.ceil(spec.duration * 4 / cols)}`, "-frames:v", "1", "-update", "1", path.join(WORK, "sheet.jpg")]);
console.log(`rendered ${out} (${probeDur(out).toFixed(2)}s), loudness target ${target} LUFS (measured before normalisation ${meas.input_i})`);
console.log(`sheet ${path.join(WORK, "sheet.jpg")}`);
