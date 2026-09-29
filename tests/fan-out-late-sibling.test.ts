import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { TransitionRequest, TransitionResult } from "@/core/providers/types";
import { _resetCooldownsForTests } from "@/core/providers/cooldown";
import { ProviderError, ProviderOutcomeUnknownError, ProviderQueueSkip } from "@/core/providers/types";
import { DEFAULT_FINE_TUNE, type QualityScores, type PromptIR } from "@/core/types";

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
async function queuedGeneration(tag: string, recipeId = "dissolve-match") {
  const user = Users.ensure(`usr_${tag}`);
  const project = Projects.create(user.id, tag);
  for (const [role, file] of [["start", clipA], ["end", clipB]] as const) {
    await ingestFile({ projectId: project.id, userId: user.id, role, buffer: fs.readFileSync(file), originalName: path.basename(file), mime: "video/mp4" });
  }
  await runAnalyzeJob(Jobs.create("analyze", { projectId: project.id }), () => {});
  const opp = ensureOpportunityForRecipe(project.id, recipeId);
  const gen = Generations.create({
    projectId: project.id, opportunityId: opp.id, recipeId: opp.recipeId, intent: "smooth", fineTune: DEFAULT_FINE_TUNE, mode: "preview",
    status: "queued", stage: "queued", stageLabel: "Getting ready", progress: 0, friendlyError: null, result: null, jobId: null, parentGenerationId: null,
  });
  return { user, gen, job: Jobs.create("generate", { generationId: gen.id }) };
}

/** Real routing with fake renders; `fal` decides whether the quick fal models are in the route. */
function useProviders(t: TestContext, fal: boolean, provider: (req: TransitionRequest) => Promise<TransitionResult>) {
  const { force } = config.providers, { parallelAttempts, maxAttempts } = config.generation;
  config.providers.force = "";
  config.generation.parallelAttempts = 2;
  config.generation.maxAttempts = 3; // these tests cover fan-out and retries; one take per click is tested on its own
  t.after(() => { config.providers.force = force; config.generation.parallelAttempts = parallelAttempts; config.generation.maxAttempts = maxAttempts; });
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
  let preparedDuringRender = false;
  useProviders(t, true, async (req) => {
    // A provider can wait on the network while source clips are prepared; a sequential pipeline deadlocks here.
    const partB = path.join(path.dirname(req.outputPath), "part_b.mp4");
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(partB) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    preparedDuringRender = fs.existsSync(partB);
    return rendered(req, "h3");
  });
  const { gen, job } = await queuedGeneration("fanout_quick");
  await runGenerateJob(job, () => {}, passingJudge);
  for (const a of Attempts.forGeneration(gen.id)) models.push(a.modelId);
  assert.deepEqual(models, ["fal:minimax-h3-max"]);
  const g = Generations.get(gen.id)!;
  assert.equal(g.status, "ready");
  assert.equal(preparedDuringRender, true, "source preparation overlaps the provider wait");
  const timing = Attempts.forGeneration(gen.id)[0].params.timings as Record<string, number>;
  for (const key of ["providerMs", "normalizeMs", "judgeMs"]) assert.ok(timing[key] >= 0, `recorded ${key}`);
  // Dissolve Match asks for 0.9 s at the default pace, but a 1.2 s render is played no faster than 1.25x: 0.96 s.
  assert.ok(Math.abs(g.result!.bridgeDurationSec - 0.96) < 0.01, `bridge ${g.result!.bridgeDurationSec}s`);
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

test("a clean take in a different style is delivered with a note instead of retried and refunded", async (t) => {
  const requested: string[] = [];
  useProviders(t, true, async (req) => { requested.push(req.transitionType); return rendered(req, "other-style"); });
  const previousAttempts = config.generation.maxAttempts;
  config.generation.maxAttempts = 3;
  t.after(() => { config.generation.maxAttempts = previousAttempts; });
  const { user, gen, job } = await queuedGeneration("style_other", "orbit");
  assert.ok(Users.spend(user.id, 2));
  const otherStyle = async () => ({ judge: "openai" as const, costUsd: 0, scores: { ...passing, overall: 99, styleMatch: "mismatched" as const, styleEvidence: "The camera pushes in without circling the subject.", issues: ["No orbit is visible."] } });
  await runGenerateJob(job, () => {}, otherStyle);
  assert.ok(requested.length >= 1 && requested.every(r => r === "orbit"));
  const done = Generations.get(gen.id)!;
  assert.equal(done.status, "ready");
  assert.match(done.result?.suggestion ?? "", /Not quite Orbit Transition/);
  assert.equal(Users.get(user.id)!.credits, user.credits - 2, "a delivered take is charged");
});

for (const requestId of [null, "accepted-job"] as const) {
  test(`uncertain Higgsfield ${requestId ? "result" : "submission"} stops fallback and refunds only once`, async (t) => {
    let calls = 0;
    let genId = "";
    useProviders(t, false, async (req) => {
      calls++;
      req.onSubmission?.({ state: "submitting" });
      assert.equal(Attempts.forGeneration(genId)[0].params.providerRequestState, "submitting");
      if (requestId) {
        req.onSubmission?.({ state: "submitted", requestId, correlationId: "correlation" });
        assert.equal(Attempts.forGeneration(genId)[0].providerJobId, requestId, "receipt persisted before polling completes");
      }
      throw new ProviderOutcomeUnknownError("lost response", "higgsfield", requestId, "correlation");
    });
    config.generation.parallelAttempts = 1;
    const { user, gen, job } = await queuedGeneration(`unknown_${requestId ?? "submission"}`);
    genId = gen.id;
    assert.ok(Users.spend(user.id, 2));
    await assert.rejects(runGenerateJob(job, () => {}, passingJudge), /automatic generation fallback stopped/);
    assert.equal(calls, 1, "neither another model nor a procedural fallback is launched");
    const [attempt] = Attempts.forGeneration(gen.id);
    assert.equal(attempt.providerJobId, requestId);
    assert.equal(attempt.params.correlationId, "correlation");
    assert.equal(attempt.params.providerRequestState, "unknown");
    assert.equal(Generations.get(gen.id)?.status, "failed");
    assert.match(Generations.get(gen.id)?.friendlyError ?? "", /stopped without starting another render/);
    assert.equal(Users.get(user.id)!.credits, user.credits);
    await assert.rejects(runGenerateJob(job, () => {}, passingJudge), /already failed/);
    assert.equal(Users.get(user.id)!.credits, user.credits, "a replay cannot refund twice");
    assert.equal(calls, 1);
  });
}

for (const state of ["submitting", "submitted"] as const) {
  test(`a restart with a ${state} Higgsfield request never resubmits it`, async (t) => {
    let calls = 0;
    useProviders(t, false, async () => { calls++; throw new Error("must not generate"); });
    const { user, gen, job } = await queuedGeneration(`restart_${state}`);
    assert.ok(Users.spend(user.id, 2));
    const requestId = state === "submitted" ? "existing-paid-job" : null;
    Attempts.create({
      generationId: gen.id, n: 1, recipeId: gen.recipeId, providerId: "higgsfield", modelId: "higgsfield:dop-lite",
      promptIR: {} as PromptIR, compiledPrompt: { positive: "original shot", negative: null },
      params: { providerRequestState: state }, status: "running", providerJobId: requestId,
      outputPath: null, error: null, costUsd: 0, durationMs: 0,
    });
    Jobs.update(job.id, { status: "running" });
    Generations.update(gen.id, { status: "running" });
    Jobs.requeueStale();
    assert.equal(Jobs.get(job.id)?.status, "queued");
    await assert.rejects(runGenerateJob(job, () => {}, passingJudge), /reconciled before resubmitting/);
    assert.equal(calls, 0);
    assert.equal(Attempts.forGeneration(gen.id).length, 1);
    assert.equal(Attempts.forGeneration(gen.id)[0].providerJobId, requestId);
    assert.equal(Generations.get(gen.id)?.status, "failed");
    assert.equal(Users.get(user.id)!.credits, user.credits);
  });
}

test("leaving a backed-up queue does not use up an attempt", async (t) => {
  let calls = 0;
  useProviders(t, true, async (req) => {
    calls++;
    if (calls === 1) throw new ProviderQueueSkip("fal Wan 3.0 Prime queue too long (1263 ahead); trying another model", "fal");
    return rendered(req, "after-skip");
  });
  config.generation.parallelAttempts = 1;
  const previousAttempts = config.generation.maxAttempts;
  config.generation.maxAttempts = 1;
  t.after(() => { config.generation.maxAttempts = previousAttempts; });
  const { user, gen, job } = await queuedGeneration("queue_skip");
  assert.ok(Users.spend(user.id, 2));
  await runGenerateJob(job, () => {}, passingJudge);
  assert.equal(calls, 2, "the next model ran even though only one attempt was allowed");
  assert.equal(Generations.get(gen.id)?.status, "ready");
  const rows = Attempts.forGeneration(gen.id);
  assert.deepEqual(rows.map((a) => a.n), [1, 2], "attempt rows keep their own numbering");
  assert.equal(rows[0].status, "failed");
});

test("a provider with an empty wallet does not use up an attempt", async (t) => {
  let calls = 0;
  useProviders(t, true, async (req) => {
    calls++;
    if (calls === 1) throw new ProviderError('higgsfield 403: {"detail":"not_enough_credits"}', false, "higgsfield");
    return rendered(req, "after-billing");
  });
  config.generation.parallelAttempts = 1;
  const previousAttempts = config.generation.maxAttempts;
  config.generation.maxAttempts = 1;
  t.after(() => { config.generation.maxAttempts = previousAttempts; _resetCooldownsForTests(); });
  const { user, gen, job } = await queuedGeneration("billing_skip");
  assert.ok(Users.spend(user.id, 2));
  await runGenerateJob(job, () => {}, passingJudge);
  assert.equal(calls, 2);
  assert.equal(Generations.get(gen.id)?.status, "ready");
});

test("one take per click: a take under the bar is delivered with a note, not retried or refunded", async (t) => {
  let renders = 0;
  useProviders(t, true, async (req) => { renders++; return rendered(req, "single"); });
  config.generation.maxAttempts = 1;
  const { user, gen, job } = await queuedGeneration("single_take");
  const before = Users.get(user.id)!.credits;
  const weak = async () => ({ judge: "heuristic" as const, costUsd: 0, scores: { ...passing, overall: 62, issues: ["Soft blend in the middle"] } });
  await runGenerateJob(job, () => {}, weak);
  assert.equal(renders, 1, "one click, one render");
  const g = Generations.get(gen.id)!;
  assert.equal(g.status, "ready");
  assert.equal(Users.get(user.id)!.credits, before, "the take was delivered, so the credits stay spent");
});
