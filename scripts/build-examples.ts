/**
 * Build the homepage before/after examples.
 * Sources: public/examples/src/<id>/{a.mp4,b.mp4[,bridge.mp4]}. When a bridge is missing the
 * procedural provider renders one, so the page never depends on a paid model.
 * Falls back to public/samples pairs when no src folder exists.
 * Output: public/examples/<id>/{a,b,before,after,bridge}.mp4 + poster.jpg, and public/examples/manifest.json.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { chooseOutputFrame, extractFrameAt, ffmpeg, makeProxy, normalizeBridge, probe, stitch, trimClip, type FrameSpec } from "@/core/media/ffmpeg";
import { localProvider, LOCAL_MODEL } from "@/core/providers/local";
import { getRecipe } from "@/core/recipes/registry";
import { DEMO_EXAMPLES } from "@/components/DemoScenes";

const ROOT = path.join(process.cwd(), "public", "examples");
const SRC = path.join(ROOT, "src");
const SAMPLES = path.join(process.cwd(), "public", "samples");
const RECIPE_FOR: Record<string, string> = {
  "coffee-ocean": "liquid-transform", "wheel-tunnel": "tunnel-rush", "eye-space": "portal-eye", "phone-city": "portal-phone",
  "door-beach": "portal-door", "window-clouds": "portal-window", "steam-fog": "smoke-transform", "mirror-outfit": "portal-mirror",
};

async function build(id: string, title: string, aSrc: string, bSrc: string, bridgeSrc: string | null) {
  const dir = path.join(ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  const info = await probe(aSrc);
  const spec: FrameSpec = { ...chooseOutputFrame(info.width, info.height), fps: config.output.fps };
  const a = path.join(dir, "a.mp4"), b = path.join(dir, "b.mp4");
  await makeProxy(aSrc, a, spec, info.hasAudio);
  await makeProxy(bSrc, b, spec, (await probe(bSrc)).hasAudio);
  const da = (await probe(a)).durationSec;
  const fa = path.join(dir, "frame_a.jpg"), fb = path.join(dir, "frame_b.jpg");
  await extractFrameAt(a, da - 2 / spec.fps, fa);
  await extractFrameAt(b, 0, fb);
  const recipe = getRecipe(RECIPE_FOR[id] ?? "push-through");
  const rawBridge = path.join(dir, "bridge_raw.mp4");
  if (bridgeSrc) fs.copyFileSync(bridgeSrc, rawBridge);
  else await localProvider.generateTransition({ firstFramePath: fa, lastFramePath: fb, prompt: { positive: "", negative: null }, durationSec: 1.2, aspectRatio: "16:9", outputPath: rawBridge, transitionType: recipe.id, motionStrength: 0.7, local: { spec, recipe, focusA: { x: 0.5, y: 0.55 }, focusB: { x: 0.5, y: 0.5 } } }, LOCAL_MODEL);
  const bridge = path.join(dir, "bridge.mp4");
  await normalizeBridge(rawBridge, bridge, spec, bridgeSrc ? Math.min(2.0, (await probe(rawBridge)).durationSec) : 1.2);
  const list = path.join(dir, "concat.txt");
  fs.writeFileSync(list, [a, b].map((p) => `file '${p}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", path.join(dir, "before.mp4")]);
  const partA = path.join(dir, "part_a.mp4");
  await trimClip(a, partA, null, da, spec);
  await stitch(partA, bridge, b, path.join(dir, "after.mp4"), spec, config.output.seamCrossfadeSec);
  await extractFrameAt(path.join(dir, "after.mp4"), Math.max(0, da - 0.2), path.join(dir, "poster.jpg"));
  for (const f of ["bridge_raw.mp4", "concat.txt", "part_a.mp4"]) fs.rmSync(path.join(dir, f), { force: true });
  return { id, title, a: `/examples/${id}/a.mp4`, b: `/examples/${id}/b.mp4`, before: `/examples/${id}/before.mp4`, after: `/examples/${id}/after.mp4`, poster: `/examples/${id}/poster.jpg`, bridge: `/examples/${id}/bridge.mp4`, generated: !!bridgeSrc };
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true });
  const manifest: unknown[] = [];
  for (const ex of DEMO_EXAMPLES) {
    const srcDir = path.join(SRC, ex.id);
    let aSrc = path.join(srcDir, "a.mp4"), bSrc = path.join(srcDir, "b.mp4");
    const bridgeSrc = fs.existsSync(path.join(srcDir, "bridge.mp4")) ? path.join(srcDir, "bridge.mp4") : null;
    if (!fs.existsSync(aSrc) || !fs.existsSync(bSrc)) {
      aSrc = path.join(SAMPLES, `${ex.id}-a.mp4`); bSrc = path.join(SAMPLES, `${ex.id}-b.mp4`);
      if (!fs.existsSync(aSrc) || !fs.existsSync(bSrc)) { console.log("skip", ex.id, "(no source footage)"); continue; }
    }
    console.log("build", ex.id, bridgeSrc ? "(generated bridge)" : "(procedural bridge)");
    manifest.push(await build(ex.id, ex.title, aSrc, bSrc, bridgeSrc));
  }
  fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("wrote manifest with", manifest.length, "examples");
}
main().catch((e) => { console.error(e); process.exit(1); });
