/**
 * Render a looping preview for every recipe using the procedural provider on two sample frames.
 * Output: public/library/<recipeId>.mp4 (A hold -> bridge -> B hold).
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { RECIPES } from "@/core/recipes/registry";
import { localProvider, LOCAL_MODEL } from "@/core/providers/local";
import { extractFrameAt, probe, stillWithMove, ffmpeg, type FrameSpec } from "@/core/media/ffmpeg";

const OUT = path.join(process.cwd(), "public", "library");
const SAMPLES = path.join(process.cwd(), "public", "samples");
const spec: FrameSpec = { width: 640, height: 360, fps: 30 };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const a = path.join(SAMPLES, "coffee-ocean-a.mp4"), b = path.join(SAMPLES, "coffee-ocean-b.mp4");
  if (!fs.existsSync(a) || !fs.existsSync(b)) throw new Error("run `npm run samples` first");
  const tmp = fs.mkdtempSync(path.join(OUT, ".tmp-"));
  const fa = path.join(tmp, "a.jpg"), fb = path.join(tmp, "b.jpg");
  await extractFrameAt(a, (await probe(a)).durationSec - 0.05, fa);
  await extractFrameAt(b, 0.05, fb);
  const holdA = path.join(tmp, "holdA.mp4"), holdB = path.join(tmp, "holdB.mp4");
  await stillWithMove(fa, holdA, spec, 0.7, { zoomFrom: 1, zoomTo: 1.03, fx: 0.5, fy: 0.5 });
  await stillWithMove(fb, holdB, spec, 0.7, { zoomFrom: 1, zoomTo: 1.03, fx: 0.5, fy: 0.5 });
  for (const r of RECIPES) {
    const out = path.join(OUT, `${r.id}.mp4`);
    if (fs.existsSync(out) && !process.argv.includes("--force")) continue;
    const bridge = path.join(tmp, `${r.id}.mp4`);
    await localProvider.generateTransition({
      firstFramePath: fa, lastFramePath: fb, prompt: { positive: "", negative: null }, durationSec: Math.min(1.4, Math.max(0.5, r.recommendedDuration[1])),
      aspectRatio: "16:9", outputPath: bridge, transitionType: r.id, motionStrength: 0.7,
      local: { spec, recipe: r, focusA: { x: 0.5, y: 0.55 }, focusB: { x: 0.74, y: 0.3 } },
    }, LOCAL_MODEL);
    const list = path.join(tmp, `${r.id}.txt`);
    fs.writeFileSync(list, [holdA, bridge, holdB].map((p) => `file '${p}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-an", "-movflags", "+faststart", out]);
    console.log("preview", r.id);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
