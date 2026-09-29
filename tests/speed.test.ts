import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import OpenAI from "openai";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-speed-"));
process.env.SEAM_DATA_DIR = dir;
const { Assets, Projects, Users } = await import("@/db/repo");
const { ingestFile } = await import("@/lib/server/ingest");
const { ensureProxy, specForStart } = await import("@/core/pipeline/proxy");
const { probe } = await import("@/core/media/ffmpeg");
const { noteOpenAIError, openaiOutOfCredit, resetOpenAICredit } = await import("@/core/openai");

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
function clip(file: string, source: string, size: string, seconds: number) {
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `${source}=size=${size}:rate=30`, "-t", String(seconds), "-pix_fmt", "yuv420p", file]);
  return fs.readFileSync(file);
}

test("an upload starts its proxy at once, and analysis joins that work instead of encoding again", async () => {
  const user = Users.ensure("usr_speed");
  const project = Projects.create(user.id, "speed");
  const a = clip(path.join(dir, "a.mp4"), "testsrc", "360x640", 2);
  const b = clip(path.join(dir, "b.mp4"), "smptehdbars", "640x360", 2);
  const start = await ingestFile({ projectId: project.id, userId: user.id, role: "start", buffer: a, originalName: "a.mp4", mime: "video/mp4" });
  const spec = specForStart(start);
  const first = ensureProxy(start, spec);
  assert.equal(ensureProxy(start, spec), first, "a second caller joins the build under way");
  const built = await first;
  assert.ok(built.proxyPath && fs.existsSync(built.proxyPath));
  const mtime = fs.statSync(built.proxyPath).mtimeMs;
  await ensureProxy(Assets.get(start.id)!, spec);
  assert.equal(fs.statSync(built.proxyPath).mtimeMs, mtime, "a finished proxy for the same frame is reused");

  // The end clip is landscape in a portrait project: it is fitted (blurred backdrop), not cropped, to the frame.
  const end = await ingestFile({ projectId: project.id, userId: user.id, role: "end", buffer: b, originalName: "b.mp4", mime: "video/mp4" });
  const endProxy = await ensureProxy(end, spec);
  const info = await probe(endProxy.proxyPath!);
  assert.deepEqual([info.width, info.height], [spec.width, spec.height]);
});

test("an empty OpenAI account is remembered, so no render is paid for that nothing could judge", () => {
  resetOpenAICredit();
  assert.equal(openaiOutOfCredit(), false);
  noteOpenAIError(new OpenAI.APIError(429, { code: "rate_limit_exceeded" }, "slow down", new Headers()));
  assert.equal(openaiOutOfCredit(), false, "a rate limit is not an empty account");
  const t = Date.now();
  noteOpenAIError(new OpenAI.APIError(429, { code: "insufficient_quota" }, "You exceeded your current quota", new Headers()), t);
  assert.equal(openaiOutOfCredit(t + 1000), true);
  assert.equal(openaiOutOfCredit(t + 11 * 60_000), false, "checked again after ten minutes");
  resetOpenAICredit();
});
