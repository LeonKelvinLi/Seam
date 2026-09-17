/**
 * Short-form ad renderer. Reads a JSON spec, normalises every segment to 1080x1920@30 with stereo audio
 * (original audio preserved, speed-ramped with atempo when a segment is sped up), concatenates, burns
 * captions (Impact, outlined), synthesises restrained sound design (whoosh / impact / riser / sub / click
 * on an ambient bed), draws an end card, and writes a contact sheet for review.
 *
 * usage: tsx scripts/render-ads.ts spec.json [adId]
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ffmpeg, probe } from "@/core/media/ffmpeg";

const W = 1080, H = 1920, FPS = 30;
const FONTS: Record<string, string> = { impact: "/System/Library/Fonts/Supplemental/Impact.ttf", arial: "/System/Library/Fonts/Supplemental/Arial Bold.ttf", black: "/System/Library/Fonts/Supplemental/Arial Black.ttf" };
const OUT = path.join(process.cwd(), "public", "ads");
const TMP = path.join(process.cwd(), "data", "ads-tmp");

type Fit = "cover" | "4x5" | "wide";
interface Cap { text: string; from: number; to: number; pos?: "top" | "mid" | "low" | "lower"; size?: number; font?: "impact" | "arial" | "black"; color?: string }
interface Sfx { kind: "whoosh" | "impact" | "riser" | "sub" | "click" | "boom"; at: number; gain?: number }
interface Ramp { head: number; tail: number; edgeSpeed: number; midSpeed: number }
interface Seg { src: string; start?: number; end?: number; speed?: number; ramp?: Ramp; sharpen?: boolean; fit?: Fit; mute?: boolean; gain?: number; image?: { hold: number; zoom?: "in" | "out" | "none"; fx?: number; fy?: number }; captions?: Cap[]; sfx?: Sfx[]; freezeEnd?: number }
interface EndCard { headline: string; headline2?: string; sub?: string; hold: number; cta?: string; footer?: string; bgFrom?: string; style?: "sans" | "serif"; bgClip?: { src: string; start?: number; blur?: number; dim?: number }; accent?: string; fadeSec?: number }
interface Ad { id: string; title: string; segs: Seg[]; captions?: Cap[]; sfx?: Sfx[]; endCard?: EndCard; bed?: boolean; xfadeSec?: number; grain?: number }

const esc = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
const bgFill = (blur = 45) => `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${blur},eq=brightness=-0.22:saturation=1.1`;

function fitFilter(fit: Fit): string {
  if (fit === "cover") return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[v0]`;
  if (fit === "wide") return `[0:v]split[bg][fg];[bg]${bgFill()}[bgb];[fg]scale=${W}:-2[fgs];[bgb][fgs]overlay=0:(H-h)/2[v0]`;
  return `[0:v]split[bg][fg];[bg]${bgFill()}[bgb];[fg]crop='min(iw,ih*0.8)':ih,scale=${W}:${Math.round(W * 1.25)}[fgs];[bgb][fgs]overlay=0:(H-h)/2[v0]`;
}

function atempoChain(speed: number): string {
  const parts: string[] = [];
  let s = speed;
  while (s > 2) { parts.push("atempo=2"); s /= 2; }
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  parts.push(`atempo=${s.toFixed(4)}`);
  return parts.join(",");
}

async function normalize(seg: Seg, out: string): Promise<number> {
  const fit = seg.fit ?? "cover";
  if (seg.image) {
    const frames = Math.round(seg.image.hold * FPS);
    const zoom = seg.image.zoom === "none" ? "1.02" : seg.image.zoom === "out" ? `1.12-0.12*on/${frames}` : `1+0.12*on/${frames}`;
    const fx = seg.image.fx ?? 0.5, fy = seg.image.fy ?? 0.5;
    const filter = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${zoom}':d=${frames}:x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':s=${W}x${H}:fps=${FPS},format=yuv420p[v]`;
    await ffmpeg(["-i", seg.src, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-filter_complex", filter, "-map", "[v]", "-map", "1:a", "-frames:v", String(frames), "-t", String(seg.image.hold),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-ar", "48000", "-ac", "2", out]);
    return (await probe(out)).durationSec;
  }
  const info = await probe(seg.src);
  const speed = seg.speed ?? 1;
  const args = ["-i", seg.src];
  if (!info.hasAudio || seg.mute) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  const start = seg.start ?? 0, end = seg.end ?? info.durationSec;
  const sharpen = seg.sharpen ? ",unsharp=5:5:0.55:5:5:0" : "";
  let vf: string;
  let outDur = (end - start) / speed;
  if (seg.ramp) {
    // Speed ramp: slow head, fast middle, slow tail — the bridge starts and ends near the clips' real-time motion.
    const r = seg.ramp, S = end - start;
    const h = start + S * r.head, t = start + S * (1 - r.tail);
    vf = `${fitFilter(fit)};[v0]split=3[va][vb][vc];` +
      `[va]trim=start=${start}:end=${h},setpts=(PTS-STARTPTS)/${r.edgeSpeed}[p1];` +
      `[vb]trim=start=${h}:end=${t},setpts=(PTS-STARTPTS)/${r.midSpeed}[p2];` +
      `[vc]trim=start=${t}:end=${end},setpts=(PTS-STARTPTS)/${r.edgeSpeed}[p3];` +
      `[p1][p2][p3]concat=n=3:v=1:a=0,fps=${FPS}${sharpen},format=yuv420p,setsar=1[v]`;
    outDur = (S * r.head) / r.edgeSpeed + (S * (1 - r.head - r.tail)) / r.midSpeed + (S * r.tail) / r.edgeSpeed;
  } else {
    vf = `${fitFilter(fit)};[v0]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed},fps=${FPS}${sharpen},format=yuv420p,setsar=1[v]`;
  }
  const af = (!info.hasAudio || seg.mute)
    ? `[1:a]atrim=0:${outDur.toFixed(3)},asetpts=PTS-STARTPTS[a]`
    : `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,${atempoChain(speed)},volume=${seg.gain ?? 1}[a]`;
  args.push("-filter_complex", `${vf};${af}`, "-map", "[v]", "-map", "[a]", "-t", outDur.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-ar", "48000", "-ac", "2", out);
  await ffmpeg(args);
  return (await probe(out)).durationSec;
}

const FONT_STACK = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const escXml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textLines(text: string, x: number, y: number, size: number, weight: string, fill: string, stroke = 0, family = FONT_STACK, anchor = "middle"): string {
  const lines = text.split("\n");
  return lines.map((l, i) => `<text x="${x}" y="${y + i * size * 1.12}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${stroke ? `stroke="#000" stroke-width="${stroke}" paint-order="stroke" stroke-linejoin="round"` : ""}>${escXml(l)}</text>`).join("");
}

// Serif outro: editorial type (Didot) over real desk footage, gold accent, tracked caps. The type fades up over the plate.
async function endCardSerif(card: EndCard, out: string) {
  const serif = "Didot, 'Bodoni 72', Baskerville, Georgia, serif";
  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const gold = card.accent ?? "#e3c079", ivory = "#f4efe6";
  const t = (text: string, y: number, size: number, weight: string, fill: string, family: string, ls = 0) =>
    `<text x="${W / 2}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" letter-spacing="${ls}">${escXml(text)}</text>`;
  const markPng = path.join(process.cwd(), "public", "brand", "seamcut-mark-1024.png");
  const mark = fs.existsSync(markPng) ? fs.readFileSync(markPng).toString("base64") : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="wash" cx="0.5" cy="0.56" r="0.62"><stop offset="0" stop-color="#000" stop-opacity="0.36"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#wash)"/>
    ${mark ? `<image href="data:image/png;base64,${mark}" x="${W / 2 - 100}" y="520" width="200" height="200"/>` : ""}
    ${t("Clipmelt", 880, 150, "700", ivory, serif)}
    ${t(card.headline, 1030, 92, "400", ivory, serif)}
    ${card.headline2 ? t(card.headline2, 1120, 92, "400", gold, serif) : ""}
    ${card.sub ? t(card.sub, 1200, 30, "500", "rgba(244,239,230,0.74)", sans, 7) : ""}
    ${card.cta ? `<rect x="${W / 2 - 235}" y="1300" width="470" height="98" rx="49" fill="${gold}"/>${t(card.cta, 1361, 34, "600", "#2a1e08", sans, 5)}` : ""}
    ${card.footer ? t(card.footer, 1560, 24, "500", "rgba(244,239,230,0.55)", sans, 6) : ""}
  </svg>`;
  const overlay = path.join(TMP, "end_overlay.png");
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(overlay);
  if (card.bgClip) {
    const blur = card.bgClip.blur ?? 2.5, dim = card.bgClip.dim ?? 0.16;
    const bg = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},gblur=sigma=${blur},eq=brightness=-${dim}:saturation=1.02:contrast=1.06,colorbalance=rs=0.05:gs=0.01:bs=-0.06:rm=0.03:bm=-0.04,vignette=angle=PI/3.8[bg]`;
    const ov = `[1:v]format=rgba,fade=t=in:st=0.12:d=0.7:alpha=1[ov]`;
    await ffmpeg(["-ss", String(card.bgClip.start ?? 0), "-i", card.bgClip.src, "-loop", "1", "-i", overlay, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-filter_complex", `${bg};${ov};[bg][ov]overlay=0:0:format=auto,format=yuv420p,setsar=1[v]`, "-map", "[v]", "-map", "2:a", "-t", card.hold.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-ar", "48000", "-ac", "2", out]);
    return;
  }
  const bg = path.join(TMP, "end_bg.png");
  await ffmpeg(["-sseof", "-0.05", "-i", card.bgFrom!, "-frames:v", "1", "-update", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=22,eq=brightness=-0.18:saturation=0.95:contrast=1.08`, bg]);
  const png = path.join(TMP, "end_card.png");
  await sharp(bg).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(png);
  await normalize({ src: png, image: { hold: card.hold, zoom: "in" } }, out);
}

async function endCard(card: EndCard, out: string) {
  if (card.style === "serif") return endCardSerif(card, out);
  // Ground: the last frame of the previous shot, blurred and darkened, so the card lives in the footage.
  const bg = path.join(TMP, "end_bg.png");
  if (card.bgFrom) {
    await ffmpeg(["-sseof", "-0.05", "-i", card.bgFrom, "-frames:v", "1", "-update", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=22,eq=brightness=-0.18:saturation=0.95:contrast=1.08`, bg]);
  } else {
    await sharp({ create: { width: W, height: H, channels: 3, background: "#0b0b0c" } }).png().toFile(bg);
  }
  const markPng = path.join(process.cwd(), "public", "brand", "seamcut-mark-1024.png");
  const mark = fs.existsSync(markPng) ? fs.readFileSync(markPng).toString("base64") : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="rgba(0,0,0,0.38)"/>
    ${mark ? `<image href="data:image/png;base64,${mark}" x="${W / 2 - 130}" y="470" width="260" height="260"/>` : ""}
    ${textLines("Clipmelt", W / 2, 860, 132, "700", "#f2f0ea", 0, "'Helvetica Neue', Helvetica, Arial, sans-serif")}
    ${textLines(card.headline, W / 2, 1010, 64, "700", "#f2f0ea", 0, "'Helvetica Neue', Helvetica, Arial, sans-serif")}
    ${card.sub ? textLines(card.sub, W / 2, 1170, 40, "400", "rgba(242,240,234,0.78)", 0, "'Helvetica Neue', Helvetica, Arial, sans-serif") : ""}
    ${card.cta ? `<rect x="${W / 2 - 250}" y="1330" width="500" height="104" rx="52" fill="#ffb84d"/>${textLines(card.cta, W / 2, 1397, 42, "700", "#1a1205", 0, "'Helvetica Neue', Helvetica, Arial, sans-serif")}` : ""}
    ${card.footer ? textLines(card.footer, W / 2, 1560, 26, "400", "rgba(242,240,234,0.55)", 0, "'Helvetica Neue', Helvetica, Arial, sans-serif") : ""}
  </svg>`;
  const png = path.join(TMP, "end_card.png");
  await sharp(bg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(png);
  await normalize({ src: png, image: { hold: card.hold, zoom: "in" } }, out);
}

async function sfxBank(): Promise<Record<string, string>> {
  const bank: Record<string, [string, number]> = {
    whoosh: ["anoisesrc=color=pink:d=0.7:a=0.8,bandpass=f=1400:w=1400,afade=t=in:d=0.28,afade=t=out:st=0.35:d=0.35,volume=1.4", 0.7],
    impact: ["sine=f=52:d=0.9,afade=t=out:st=0.04:d=0.86:curve=exp,volume=2.2", 0.9],
    click: ["anoisesrc=color=white:d=0.09:a=0.8,lowpass=f=1200,afade=t=out:d=0.09,volume=1.0", 0.09],
    riser: ["anoisesrc=color=pink:d=1.5:a=0.7,highpass=f=400,afade=t=in:d=1.35,afade=t=out:st=1.35:d=0.15,volume=0.9", 1.5],
    sub: ["sine=f=42:d=2.2,afade=t=in:d=0.4,afade=t=out:st=1.4:d=0.8,volume=1.1", 2.2],
    boom: ["sine=f=38:d=1.4,afade=t=out:st=0.05:d=1.3:curve=exp,volume=2.6", 1.4],
  };
  const out: Record<string, string> = {};
  for (const [k, [f, d]] of Object.entries(bank)) {
    const p = path.join(TMP, `sfx_${k}.wav`);
    if (!fs.existsSync(p)) await ffmpeg(["-f", "lavfi", "-i", f, "-t", String(d), "-ar", "48000", "-ac", "2", p]);
    out[k] = p;
  }
  return out;
}

async function captionPngs(caps: Cap[]): Promise<{ file: string; y: string; from: number; to: number }[]> {
  const out: { file: string; y: string; from: number; to: number }[] = [];
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    const size = c.size ?? 92;
    const lines = c.text.split("\n").length;
    const h = Math.round(size * 1.12 * lines + 60);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}">${textLines(c.text, W / 2, size + 20, size, "700", c.color ?? "#ffffff", 14)}</svg>`;
    const file = path.join(TMP, `cap_${i}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    const y = c.pos === "top" ? "160" : c.pos === "mid" ? "(H-h)/2" : c.pos === "lower" ? "H-380" : "H*0.72-h/2";
    out.push({ file, y, from: c.from, to: c.to });
  }
  return out;
}

async function renderAd(ad: Ad) {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  const parts: string[] = [];
  const durs: number[] = [];
  for (let i = 0; i < ad.segs.length; i++) {
    const out = path.join(TMP, `${ad.id}_seg${i}.mp4`);
    durs.push(await normalize(ad.segs[i], out)); parts.push(out);
  }
  if (ad.endCard) { const out = path.join(TMP, `${ad.id}_end.mp4`); await endCard({ ...ad.endCard, bgFrom: ad.endCard.bgFrom ?? parts[parts.length - 1] }, out); parts.push(out); durs.push(ad.endCard.hold); }
  const X = ad.xfadeSec ?? 0;
  // The seam into part i blends over X, except the outro, which may land through a longer dissolve.
  const fadeInto = (i: number) => (ad.endCard?.fadeSec && i === parts.length - 1 ? ad.endCard.fadeSec : X);
  const offsets: number[] = [];
  let t = 0;
  for (let i = 0; i < parts.length; i++) { offsets.push(t); t += durs[i] - (i < parts.length - 1 ? fadeInto(i + 1) : 0); }
  const total = t;
  const endOffset = ad.endCard ? offsets[parts.length - 1] : total;
  const base = path.join(TMP, `${ad.id}_base.mp4`);
  if (X > 0 && parts.length > 1) {
    // Chain of short crossfades (video + audio) so every seam blends over a few frames.
    const inputs = parts.flatMap((p) => ["-i", p]);
    let vprev = "[0:v]", aprev = "[0:a]", acc = durs[0];
    const f: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const Xi = fadeInto(i);
      const off = (acc - Xi).toFixed(3);
      const vl = i === parts.length - 1 ? "[vx]" : `[vx${i}]`, al = i === parts.length - 1 ? "[ax]" : `[ax${i}]`;
      f.push(`${vprev}[${i}:v]xfade=transition=fade:duration=${Xi}:offset=${off}${vl}`);
      f.push(`${aprev}[${i}:a]acrossfade=d=${Xi}:c1=tri:c2=tri${al}`);
      vprev = vl; aprev = al; acc += durs[i] - Xi;
    }
    await ffmpeg([...inputs, "-filter_complex", f.join(";"), "-map", "[vx]", "-map", "[ax]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-ar", "48000", "-ac", "2", base]);
  } else {
    const list = path.join(TMP, `${ad.id}_list.txt`);
    fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-ar", "48000", "-ac", "2", base]);
  }

  // captions (absolute) + segment-relative captions
  const caps: Cap[] = [...(ad.captions ?? [])];
  ad.segs.forEach((s, i) => (s.captions ?? []).forEach((c) => caps.push({ ...c, from: offsets[i] + c.from, to: offsets[i] + c.to })));
  const sfx: Sfx[] = [...(ad.sfx ?? [])];
  ad.segs.forEach((s, i) => (s.sfx ?? []).forEach((x) => sfx.push({ ...x, at: offsets[i] + x.at })));
  if (ad.endCard) sfx.push({ kind: "click", at: endOffset, gain: 0.8 });

  const bank = await sfxBank();
  const inputs = ["-i", base];
  const pngs = await captionPngs(caps);
  for (const p of pngs) inputs.push("-i", p.file);
  const grain = ad.grain ? `noise=alls=${ad.grain}:allf=t+u,` : "";
  let vchain = grain ? `[0:v]${grain.replace(/,$/, "")}[vg];[vg]` : "[0:v]";
  pngs.forEach((p, i) => { const label = i === pngs.length - 1 ? "[vout]" : `[v${i + 1}]`; vchain += `[${i + 1}:v]overlay=x=(W-w)/2:y=${p.y}:enable='between(t,${p.from.toFixed(3)},${p.to.toFixed(3)})'${label};${i === pngs.length - 1 ? "" : label}`; });
  if (!pngs.length) vchain += "null[vout];"; else vchain = vchain.replace(/;$/, ";");
  if (grain && vchain.startsWith("[0:v]") && !pngs.length) vchain = `[0:v]${grain.replace(/,$/, "")}[vout];`;
  const amixIn: string[] = ["[0:a]volume=1[a0]"];
  let n = 1 + pngs.length;
  const audioInputs = [] as string[];
  const audioLabels: string[] = ["[a0]"];
  if (ad.bed !== false) { inputs.push("-f", "lavfi", "-i", `anoisesrc=color=brown:d=${total.toFixed(2)}:a=0.5,lowpass=f=260,volume=0.05`); amixIn.push(`[${n}:a]anull[a${n}]`); audioLabels.push(`[a${n}]`); n++; }
  for (const x of sfx) { inputs.push("-i", bank[x.kind]); amixIn.push(`[${n}:a]adelay=${Math.max(0, Math.round(x.at * 1000))}|${Math.max(0, Math.round(x.at * 1000))},volume=${x.gain ?? 1}[a${n}]`); audioLabels.push(`[a${n}]`); n++; }
  void audioInputs;
  const audio = `${amixIn.join(";")};${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=first:normalize=0,alimiter=limit=0.92[aout]`;
  const final = path.join(OUT, `${ad.id}.mp4`);
  await ffmpeg([...inputs, "-filter_complex", `${vchain}${audio}`, "-map", "[vout]", "-map", "[aout]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final]);
  const strip = path.join(OUT, `${ad.id}-strip.jpg`);
  await ffmpeg(["-i", final, "-vf", "fps=2,scale=180:-1,tile=10x4", "-frames:v", "1", "-q:v", "3", strip]);
  console.log(`rendered ${ad.id}: ${total.toFixed(1)}s -> ${final}`);
  console.log(`  segments: ${ad.segs.map((s, i) => `${i}@${offsets[i].toFixed(1)}s ${path.basename(s.src)}`).join(" | ")}`);
}

async function main() {
  const specPath = process.argv[2];
  if (!specPath) throw new Error("usage: tsx scripts/render-ads.ts spec.json [adId]");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as { ads: Ad[] };
  const only = process.argv[3];
  for (const ad of spec.ads) if (!only || ad.id === only) await renderAd(ad);
}
main().catch((e) => { console.error(e); process.exit(1); });
