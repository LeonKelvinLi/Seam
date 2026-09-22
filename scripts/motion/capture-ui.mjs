/**
 * Screenshots of the live SeamCut UI for ads: library grid, empty studio, and the studio after two clips are dropped in
 * and analysed (recommendations). Uses a throwaway guest session; no generation is started, so no credits are spent.
 *   node scripts/motion/capture-ui.mjs [baseUrl] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "./cdp.mjs";

const BASE = (process.argv[2] || "https://seamcut.onrender.com").replace(/\/$/, "");
const OUT = process.argv[3] || path.join(process.cwd(), "data", "ads-tmp", "ui");
fs.mkdirSync(OUT, { recursive: true });
const root = process.cwd();
const clipA = path.resolve(process.env.CLIP_A || path.join(root, "public/examples/door-beach/a.mp4"));
const clipB = path.resolve(process.env.CLIP_B || path.join(root, "public/examples/door-beach/b.mp4"));
const tag = process.env.UI_TAG ? `_${process.env.UI_TAG}` : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await launch({ width: Number(process.env.UI_W || 1440), height: Number(process.env.UI_H || 900), scale: Number(process.env.UI_SCALE || 2) });
try {
  await b.goto(`${BASE}/library`, 4000);
  await b.eval("window.scrollTo(0, 0)");
  await b.screenshot(path.join(OUT, `library_desktop${tag}.png`));
  console.log("library captured");

  await b.goto(`${BASE}/create`, 3500);
  await b.screenshot(path.join(OUT, `create_empty_desktop${tag}.png`));
  console.log("empty studio captured");

  await b.setFiles('input[type="file"]', 0, [clipA]);
  await sleep(6000);
  await b.setFiles('input[type="file"]', 1, [clipB]);
  // Wait for both uploads, the analysis and the recommendation lanes.
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await sleep(2000);
    ready = await b.eval(`document.body.innerText.includes("Recommended for your clips")`);
    if (i === 4) await b.screenshot(path.join(OUT, `create_uploading_desktop${tag}.png`));
  }
  await sleep(2500);
  await b.eval("window.scrollTo(0, 0)");
  await b.screenshot(path.join(OUT, `create_recommended_desktop${tag}.png`));
  console.log(ready ? "recommendations captured" : "recommendations did not appear in time (captured current state)");
} finally {
  await b.close();
}
