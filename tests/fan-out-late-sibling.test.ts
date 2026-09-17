import { test, type TestContext } from "node:test";
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
const clipA = path.join(dir, "a.mp4"), clipB = path.join(dir, "b.mp4");
clip(clipA, "testsrc", 2);
clip(clipB, "smptehdbars", 2);

const passing: QualityScores = {
  startFidelity: 90, endFidelity: 90, subjectConsistency: 90, continuity: 90, artifacts: 90, aesthetic: 90, transitionSuccess: 90,
  overall: 90, issues: [], seamless: true,
};
const passingJudge = async () => ({ judge: "openai" as const, costUsd: 0, scores: { ...passing } });

/** An analysed project and a queued preview generation for it, as createGeneration leaves them (minus the runner). */
async function queuedGeneration(tag: string) {
  const user = Users.ensure(`usr_${tag}`);
  const project = Projects.create(user.id, tag);
  for (const [role, file] of [["start", clipA], ["end", clipB]] as const) {
    await ingestFile({ projectId: project.id, userId: user.id, role, buffer: fs.readFileSync(file), originalName: path.basename(file), mime: "video/mp4" });
  }
  await runAnalyzeJob(Jobs.create("analyze", { projectId: project.id }), () => {});
  const opp = ensureOpportunityForRecipe(project.id, "dissolve-match");
  const gen = Generations.create({
    projectId: project.id, opportunityId: opp.id, recipeId: opp.recipeId, intent: "smooth", fineTune: DEFAULT_FINE_TUNE, mode: "preview",
    status: "queued", stage: "queued", stageLabel: "Getting ready", progress: 0, friendlyError: null, result: null, jobId: null, parentGenerationId: null,
  });
  return { user, gen, job: Jobs.create("generate", { generationId: gen.id }) };
}

/** Real routing with fake renders; `fal` decides whether the quick fal models are in the route. */
function useProviders(t: TestContext, fal: boolean, provider: (req: TransitionRequest) => Promise<TransitionResult>) {
  const { force } = config.providers, { parallelAttempts } = config.generation;
  config.providers.force = "";
  config.generation.parallelAttempts = 2;
  t.after(() => { config.providers.force = force; config.generation.parallelAttempts = parallelAttempts; });
  t.mock.method(falProvider, "isAvailable", () => fal);
  t.mock.method(higgsfieldProvider, "isAvailable", () => true);
  t.mock.method(falProvider, "generateTransition", provider);
  t.mock.method(higgsfieldProvider, "generateTransition", provider);
}

const rendered = (req: TransitionRequest, id: string): TransitionResult => {
  clip(req.outputPath, "testsrc2", 1.2);
  return { outputPath: req.outputPath, providerJobId: id, rawDurationSec: 1.2, costUsd: 0, params: {} };
};

test("a fan-out sibling that lands after the result leaves the generation ready", async (t) => {
  // Only the slow Higgsfield models route here, so the first round runs two of them. The first passes at once; the second
  // is held until the generation is ready, then reports progress and finishes, as DoP Lite did behind Kling on 2026-09-16.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  useProviders(t, false, async (req) => {
    const first = calls++ === 0;
    if (!first) {
      req.onProgress?.("Rendering at the provider");
      await held;
      req.onProgress?.("Almost done");
    }
    return rendered(req, first ? "fast" : "slow");
  });
  const { gen, job } = await queuedGeneration("fanout_late");

  await runGenerateJob(job, () => {}, passingJudge);
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

test("a quick lead model runs alone: no second model is paid for behind it", async (t) => {
  const models: string[] = [];
  useProviders(t, true, async (req) => rendered(req, "h3"));
  const { gen, job } = await queuedGeneration("fanout_quick");
  await runGenerateJob(job, () => {}, passingJudge);
  for (const a of Attempts.forGeneration(gen.id)) models.push(a.modelId);
  assert.deepEqual(models, ["fal:minimax-h3-max"]);
  const g = Generations.get(gen.id)!;
  assert.equal(g.status, "ready");
  // Dissolve Match asks for 0.9 s at the default pace; a 1.2 s render only needs 1.3x, well inside the speed cap.
  assert.ok(Math.abs(g.result!.bridgeDurationSec - 0.9) < 0.01, `bridge ${g.result!.bridgeDurationSec}s`);
});

test("a take no vision judge could check is refused, and the generation stops and refunds", async (t) => {
  let renders = 0;
  useProviders(t, true, async (req) => { renders++; return rendered(req, "unjudged"); });
  const { user, gen, job } = await queuedGeneration("fanout_unjudged");
  const before = Users.get(user.id)!.credits;
  const unjudged = async () => ({ judge: "unavailable" as const, costUsd: 0, scores: { ...passing, overall: 60, issues: ["The quality check was unavailable, so this take was not accepted."] } });
  await assert.rejects(runGenerateJob(job, () => {}, unjudged), /no vision judge answered/);
  assert.equal(renders, 1, "no further renders once the judge is known to be down");
  const g = Generations.get(gen.id)!;
  assert.equal(g.status, "failed");
  assert.match(g.friendlyError ?? "", /quality check is briefly unavailable/);
  assert.equal(Users.get(user.id)!.credits, before + 2, "the preview's credits come back");
});
