/**
 * Mobile audit of the studio as a real guest on a phone-sized screen: upload two clips (no taps after that), check the
 * best transition starts by itself, wait for the result, check the result screen (video, downloads, other styles),
 * tap another style and check the paywall is scrolled into view. Screenshots each step; exits non-zero on a failure.
 * Spends one free trial run.
 *   CLIP_A=a.mp4 CLIP_B=b.mp4 node scripts/motion/../audit-mobile.mjs [baseUrl] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./motion/cdp.mjs";

const BASE = (process.argv[2] || "https://clipmelt.com").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] || "data/live-results/audit-mobile");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(), el = () => ((Date.now() - t0) / 1000).toFixed(1);
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${el()}s ${name}${detail ? ` - ${detail}` : ""}`); };

const b = await launch({ width: 390, height: 844, scale: 2 });
const shot = async (name) => b.screenshot(path.join(OUT, `${String(checks.length).padStart(2, "0")}_${name}.png`));
const text = () => b.eval("document.body.innerText");
try {
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const errors = [];
  b.on("Runtime.exceptionThrown", (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
  await b.goto(`${BASE}/create`, 2500);
  await shot("studio");
  check("studio loads", (await text()).includes("Upload two clips"));
  await b.setFiles('input[type="file"]', 0, [path.resolve(process.env.CLIP_A)]);
  await sleep(2500);
  await b.setFiles('input[type="file"]', 1, [path.resolve(process.env.CLIP_B)]);
  let started = "";
  for (let i = 0; i < 180 && !started; i++) {
    await sleep(1000);
    started = await b.eval(`new URLSearchParams(location.search).get("g") || ""`);
  }
  await shot("auto_started");
  check("generation starts by itself after upload (no tap)", !!started, started || "no generation in the URL after 3 min");
  let state = "";
  for (let i = 0; i < 600 && started && !state; i++) {
    await sleep(1000);
    state = await b.eval(`/didn't come together|couldn't build/i.test(document.body.innerText) ? "failed" : document.body.innerText.includes("Your transition is ready") ? "ready" : ""`);
    if (i === 20) await shot("generating");
  }
  check("transition delivered", state === "ready", state || "timed out");
  const gen = await b.eval(`(async () => { const g = new URLSearchParams(location.search).get("g"); const r = await fetch("/api/generations/" + g); return r.ok ? (await r.json()).generation : null; })()`);
  fs.writeFileSync(path.join(OUT, "generation.json"), JSON.stringify(gen, null, 1));
  for (const a of gen?.attemptLog ?? []) console.log(`   attempt ${a.n} ${a.modelId} ${a.status} q=${a.quality ?? "-"} ${a.error ?? ""} ${(a.issues ?? []).join(" | ")}`);
  if (state === "ready") {
    const v = await b.eval(`(() => { const v = [...document.querySelectorAll("video")].pop(); if (!v) return null; v.scrollIntoView({ block: "center" }); return { src: v.currentSrc || v.src, w: v.clientWidth }; })()`);
    await sleep(3000);
    await shot("result");
    check("result video on screen", !!v?.src, v?.src ?? "");
    const t = await text();
    check("download buttons present", /Download/i.test(t));
    const chips = await b.eval(`[...document.querySelectorAll("button")].filter((x) => x.closest("div")?.previousElementSibling?.textContent?.includes("Try a different style")).map((x) => x.textContent)`);
    check("other styles offered", chips.length > 0, chips.join(" / "));
    if (chips.length) {
      await b.eval(`[...document.querySelectorAll("button")].find((x) => x.closest("div")?.previousElementSibling?.textContent?.includes("Try a different style")).click()`);
      await sleep(3500);
      await shot("after_other_style_tap");
      const pay = await b.eval(`(() => { const h = [...document.querySelectorAll("h2")].find((x) => /free transition|free transitions|network/i.test(x.textContent)); if (!h) return null; const r = h.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; })()`);
      check("tapping another style with no credits shows the paywall on screen", !!pay && pay.top >= 0 && pay.top < pay.vh, JSON.stringify(pay));
    }
  }
  check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 1));
  await b.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `AUDIT FAILED (${failed.length})` : "AUDIT PASSED");
process.exit(failed.length ? 1 : 0);
