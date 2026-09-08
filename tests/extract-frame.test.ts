import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractFrameAt } from "@/core/media/ffmpeg";

test("a frame request at the exact clip duration still returns the last frame", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-frame-"));
  const clip = path.join(dir, "bridge.mp4");
  // 33 frames at 30 fps: the last frame sits at 1.067 s while the duration reads 1.1 s, exactly like a remapped bridge.
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=30", "-frames:v", "33", "-pix_fmt", "yuv420p", clip]);
  const out = await extractFrameAt(clip, 1.1, path.join(dir, "last.jpg"));
  assert.ok(fs.statSync(out).size > 0);
  const first = await extractFrameAt(clip, 0, path.join(dir, "first.jpg"));
  assert.ok(fs.statSync(first).size > 0);
});
