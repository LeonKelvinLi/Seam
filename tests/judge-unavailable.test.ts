import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { JUDGE_UNAVAILABLE, UNJUDGED_CAP, judgeTransition, passes } from "@/core/quality/judge";
import { getRecipe } from "@/core/recipes/registry";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

test("when no vision judge answers, the take is refused instead of passing on pixel statistics", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-judge-down-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // A clean, slow push: the pixel statistics alone would pass it.
  const bridge = path.join(dir, "bridge.mp4"), first = path.join(dir, "first.jpg"), last = path.join(dir, "last.jpg");
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-t", "1.5", "-pix_fmt", "yuv420p", bridge]);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", bridge, "-frames:v", "1", first]);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-sseof", "-0.05", "-i", bridge, "-frames:v", "1", last]);

  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-key";
  t.after(() => { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });
  const models: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    models.push(JSON.parse(String(init?.body)).model);
    return new Response(JSON.stringify({ error: { message: "Rate limit reached", type: "requests", code: "rate_limit_exceeded" } }), {
      status: 429, headers: { "content-type": "application/json", "retry-after-ms": "1" },
    });
  });

  const judged = await judgeTransition({ bridgePath: bridge, sourceFrame: first, destFrame: last, recipe: getRecipe("push-through"), prompt: "push in", tmpDir: dir, cheap: false });
  assert.equal(judged.judge, "unavailable");
  assert.ok(judged.scores.overall <= UNJUDGED_CAP, `overall ${judged.scores.overall}`);
  assert.equal(judged.scores.issues[0], JUDGE_UNAVAILABLE);
  assert.equal(passes(judged.scores, "preview"), false);
  assert.deepEqual([...new Set(models)], ["gpt-5.6-sol", "gpt-5.4-mini"], "the fallback model is asked before giving up");
});
