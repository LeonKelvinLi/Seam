/**
 * A real phone-sized screen recording of the live studio, for ads: upload two clips, wait for the recommendations,
 * pick the first one, wait for the result and let it play. Frames come from the CDP screencast with their wall-clock
 * timestamps (meta.json), so an ad can speed up the waits while showing the real elapsed time.
 * Spends one free trial run (one generation) as a fresh guest.
 *   CLIP_A=a.mp4 CLIP_B=b.mp4 node scripts/motion/record-app.mjs [baseUrl] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./cdp.mjs";

const BASE = (process.argv[2] || "https://clipmelt.com").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] || "data/ads-tmp/app-recording");
const clipA = path.resolve(process.env.CLIP_A);
const clipB = path.resolve(process.env.CLIP_B);
const W = 390, H = 844, SCALE = 2;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = [], marks = {};
const t0 = Date.now();
const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(`${marks[k].toFixed(1)}s ${k}`); };

const b = await launch({ width: W, height: H, scale: SCALE });
try {
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: true });
  b.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, "base64"));
    frames.push({ file, t: (metadata.timestamp * 1000 - t0) / 1000 });
    b.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await b.goto(`${BASE}/create`, 2500);
  await b.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  mark("studio");
  await sleep(1200);
  await b.setFiles('input[type="file"]', 0, [clipA]);
  mark("clipA");
  await sleep(2500);
  await b.setFiles('input[type="file"]', 1, [clipB]);
  mark("clipB");
  let ok = false;
  for (let i = 0; i < 240 && !ok; i++) { await sleep(1000); ok = await b.eval(`document.body.innerText.includes("Recommended for your clips")`); }
  if (!ok) throw new Error("recommendations never appeared");
  mark("recommended");
  await b.eval(`window.scrollTo({ top: 0, behavior: "smooth" })`);
  await sleep(1800);
  await b.eval(`(() => { const c = document.querySelector("button.lane-card"); c.scrollIntoView({ block: "center", behavior: "smooth" }); })()`);
  await sleep(1500);
  await b.eval(`document.querySelector("button.lane-card").click()`);
  mark("picked");
  let state = "";
  for (let i = 0; i < 600; i++) {
    await sleep(1000);
    // Check failure first: the failed screen also offers "Try another idea".
    state = await b.eval(`/didn't come together|couldn't build/i.test(document.body.innerText) ? "failed" : document.body.innerText.includes("Make wilder") ? "ready" : ""`);
    if (state) break;
  }
  mark(state || "timeout");
  // Keep the generation's own record (attempts, scores, errors) from inside the guest session, pass or fail.
  const gen = await b.eval(`(async () => { const g = new URLSearchParams(location.search).get("g"); if (!g) return null; const r = await fetch("/api/generations/" + g); return r.ok ? r.json() : { status: r.status }; })()`).catch((e) => ({ error: String(e) }));
  fs.writeFileSync(path.join(OUT, "generation.json"), JSON.stringify(gen, null, 1));
  for (const a of gen?.generation?.attemptLog ?? []) console.log(`attempt ${a.n} ${a.modelId} ${a.status} q=${a.quality ?? "-"} ${Math.round((a.durationMs ?? 0) / 1000)}s ${a.error ?? ""}`);
  if (state !== "ready") throw new Error(`generation ${state || "timed out"}`);
  await b.eval(`(() => { const v = [...document.querySelectorAll("video")].pop(); if (v) { v.scrollIntoView({ block: "center" }); v.muted = true; v.currentTime = 0; v.play(); } })()`);
  await sleep(9000);
  mark("end");
  await b.send("Page.stopScreencast");
  await sleep(500);
} finally {
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ base: BASE, width: W * SCALE, height: H * SCALE, marks, frames }, null, 1));
  await b.close();
}
console.log(`frames ${frames.length} -> ${OUT}`);
