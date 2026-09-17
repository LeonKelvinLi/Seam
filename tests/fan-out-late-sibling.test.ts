import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { TransitionRequest, TransitionResult } from "@/core/providers/types";
import { DEFAULT_FINE_TUNE, type QualityScores } from "@/core/types";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-fanout-"));
process.env.SEAM_DATA_DIR = dir;
const { config } = await import("@/core/config");
const { Attempts, Generations, Jobs, Projects, Users } = await import("@/db/repo");
const { ingestFile } = await import("@/lib/server/ingest");
const { ensureOpportunityForRecipe } = await import("@/lib/server/generate");
const { runAnalyzeJob } = await import("@/core/pipeline/analyze-job");
const { runGenerateJob } = await import("@/core/pipeline/generate-job");
const { falProvider } = await import("@/core/providers/fal");
const { higgsfieldProvider } = await import("@/core/providers/higgsfield");

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
function clip(file: string, source: string, seconds: number) {
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `${source}=size=640x360:rate=30`, "-t", String(seconds), "-pix_fmt", "yuv420p", file]);
}

const passing: QualityScores = {
  startFidelity: 90, endFidelity: 90, subjectConsistency: 90, continuity: 90, artifacts: 90, aesthetic: 90, transitionSuccess: 90,
  overall: 90, issues: [], seamless: true,
};

test("a fan-out sibling that lands after the result leaves the generation ready", async (t) => {
  const { force } = config.providers, { parallelAttempts } = config.generation;
  config.providers.force = "";
  config.generation.parallelAttempts = 2;
  t.after(() => { config.providers.force = force; config.generation.parallelAttempts = parallelAttempts; });
  t.mock.method(falProvider, "isAvailable", () => true);
  t.mock.method(higgsfieldProvider, "isAvailable", () => true);

  // The first model of the round passes at once; the second is held until the generation is ready, then reports
  // progress and finishes, as DoP Lite did behind Kling on the live service.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const provider = async (req: TransitionRequest): Promise<TransitionResult> => {
    const first = calls++ === 0;
    if (!first) {
      req.onProgress?.("Rendering at the provider");
      await held;
      req.onProgress?.("Almost done");
    }
    clip(req.outputPath, "testsrc2", 1.2);
    return { outputPath: req.outputPath, providerJobId: first ? "fast" : "slow", rawDurationSec: 1.2, costUsd: 0, params: {} };
  };
  t.mock.method(falProvider, "generateTransition", provider);
  t.mock.method(higgsfieldProvider, "generateTransition", provider);

  const user = Users.ensure("usr_fanout_test");
  const project = Projects.create(user.id, "fan-out");
  const a = path.join(dir, "a.mp4"), b = path.join(dir, "b.mp4");
  clip(a, "testsrc", 2);
  clip(b, "smptehdbars", 2);
  for (const [role, file] of [["start", a], ["end", b]] as const) {
    await ingestFile({ projectId: project.id, userId: user.id, role, buffer: fs.readFileSync(file), originalName: path.basename(file), mime: "video/mp4" });
  }
  await runAnalyzeJob(Jobs.create("analyze", { projectId: project.id }), () => {});
  const opp = ensureOpportunityForRecipe(project.id, "dissolve-match");
  const gen = Generations.create({
    projectId: project.id, opportunityId: opp.id, recipeId: opp.recipeId, intent: "smooth", fineTune: DEFAULT_FINE_TUNE, mode: "preview",
    status: "queued", stage: "queued", stageLabel: "Getting ready", progress: 0, friendlyError: null, result: null, jobId: null, parentGenerationId: null,
  });
  const job = Jobs.create("generate", { generationId: gen.id });

  await runGenerateJob(job, () => {}, async () => ({ judge: "heuristic", costUsd: 0, scores: { ...passing } }));
  assert.equal(Generations.get(gen.id)?.status, "ready");

  release();
  const deadline = Date.now() + 30_000;
  while (Attempts.forGeneration(gen.id).some((x) => x.status === "running")) {
    if (Date.now() > deadline) assert.fail("the held attempt never finished");
    await new Promise((r) => setTimeout(r, 50));
  }
  const attempts = Attempts.forGeneration(gen.id);
  assert.equal(attempts.length, 2, "the first round should have run two models");
  assert.deepEqual(attempts.map((x) => x.status), ["succeeded", "succeeded"]);
  const after = Generations.get(gen.id)!;
  assert.equal(after.status, "ready");
  assert.equal(after.stage, "ready");
  assert.equal(after.progress, 1);
});
