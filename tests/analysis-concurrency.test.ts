import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { coffee, ocean, coffeeOceanPair } from "./fixtures";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipmelt-analysis-"));
process.env.SEAM_DATA_DIR = dir;
process.env.OPENAI_API_KEY = "unit-test-key";
const { config } = await import("@/core/config");
const { Jobs, Projects, Users, Assets, Frames, VisualAnalyses } = await import("@/db/repo");
const { ingestFile } = await import("@/lib/server/ingest");
const { runAnalyzeJob } = await import("@/core/pipeline/analyze-job");

test("both clip analyses overlap, and their frame descriptions remain on the correct clips", async (t) => {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  config.output.maxEdge = 160;
  const user = Users.ensure("usr_parallel_analysis");
  const project = Projects.create(user.id, "Parallel analysis");
  const buffer = await sharp({ create: { width: 160, height: 90, channels: 3, background: "#846c50" } }).png().toBuffer();
  for (const role of ["start", "end"] as const) await ingestFile({ projectId: project.id, userId: user.id, role, buffer, originalName: `${role}.png`, mime: "image/png" });

  let active = 0, maxActive = 0, calls = 0;
  let release!: () => void;
  const bothStarted = new Promise<void>((r) => { release = r; });
  // Bound the failure path so reverting to serial calls produces an assertion failure rather than a hanging test.
  let timer: ReturnType<typeof setTimeout> | undefined;
  t.after(() => clearTimeout(timer));
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    let data: unknown = coffeeOceanPair;
    if (body.text.format.name === "frame_analysis") {
      calls++; active++; maxActive = Math.max(maxActive, active);
      if (calls === 1) timer = setTimeout(release, 3000);
      if (calls === 2) { clearTimeout(timer); release(); }
      await bothStarted;
      const content = body.input[0].content;
      const isA = content[0].text.includes("end of clip A");
      data = { frames: content.filter((v: { type: string }) => v.type === "input_image").map(() => isA ? coffee : ocean) };
      active--;
    }
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(data) }] }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await runAnalyzeJob(Jobs.create("analyze", { projectId: project.id }), () => {});
  assert.equal(calls, 2);
  assert.equal(maxActive, 2, "neither clip waits for the other network call");
  assert.equal(Projects.get(project.id)?.status, "analyzed");
  for (const [role, expected] of [["start", coffee.description], ["end", ocean.description]] as const) {
    const asset = Assets.byRole(project.id, role)!;
    const descriptions = Frames.forAsset(asset.id).map((f) => VisualAnalyses.forFrame(f.id)?.data.description).filter(Boolean);
    assert.ok(descriptions.length > 0);
    assert.ok(descriptions.every((d) => d === expected), `${role} clip descriptions`);
  }
});
