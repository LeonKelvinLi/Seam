import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ffmpeg, sampleFrames, extractFrameAt } from "@/core/media/ffmpeg";

test("batched judge samples preserve every frame from individual seeks, including short clips and audio tails", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipmelt-samples-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, rate, frames, audioTail] of [
    ["regular", "24", 49, false], ["fractional", "30000/1001", 62, false],
    ["one-frame", "30", 1, false], ["audio-tail", "30", 30, true],
  ] as const) {
    const video = path.join(dir, `${name}.mp4`);
    await ffmpeg(["-f", "lavfi", "-i", `testsrc2=size=96x64:rate=${rate}`, "-frames:v", String(frames), "-pix_fmt", "yuv420p", video]);
    let input = video;
    if (audioTail) {
      input = path.join(dir, "with-audio.mp4");
      await ffmpeg(["-i", video, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "1.3", "-c:v", "copy", "-c:a", "aac", input]);
    }
    for (const count of [1, 7, 9]) {
      const samples = await sampleFrames(input, path.join(dir, `${name}-${count}`), count);
      assert.equal(samples.length, count);
      for (const [i, sample] of samples.entries()) {
        const legacy = await extractFrameAt(input, Math.max(0, sample.t), path.join(dir, "legacy.jpg"));
        // Compare decoded pixels: metadata may differ, but the inspector must see exactly the same image.
        assert.deepEqual(await sharp(sample.path).raw().toBuffer(), await sharp(legacy).raw().toBuffer(), `${name}, ${count} samples, frame ${i}`);
      }
    }
  }
});
