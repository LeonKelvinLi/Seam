/**
 * In-process job runner backed by the jobs table. Jobs are durable (a crashed process re-queues
 * them on boot), so a separate worker process can later drain the same table unchanged.
 */
import { Jobs } from "@/db/repo";
import { logger } from "@/core/log";
import type { Job, JobType } from "@/core/types";
import { labelFor } from "./stages";
import { runAnalyzeJob } from "./analyze-job";
import { runGenerateJob } from "./generate-job";

const log = logger("runner");
const CONCURRENCY = 2;

export type Reporter = (stage: string, progress?: number, label?: string) => void;
type Handler = (job: Job, report: Reporter) => Promise<void>;

const handlers: Record<JobType, Handler> = { analyze: runAnalyzeJob, generate: runGenerateJob };

declare global {
  // eslint-disable-next-line no-var
  var __seamRunner: { active: number; timer: NodeJS.Timeout | null } | undefined;
}

function state() {
  if (!globalThis.__seamRunner) globalThis.__seamRunner = { active: 0, timer: null };
  return globalThis.__seamRunner;
}

async function runOne(job: Job) {
  const s = state();
  s.active++;
  const report: Reporter = (stage, progress, label) => Jobs.update(job.id, { stage, stageLabel: label ?? labelFor(stage), progress: progress ?? 0 });
  try {
    log.info("job start", { id: job.id, type: job.type });
    await handlers[job.type](job, report);
    Jobs.update(job.id, { status: "done", stage: "ready", stageLabel: labelFor("ready"), progress: 1, finishedAt: new Date().toISOString() });
    log.info("job done", { id: job.id });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    log.error("job failed", { id: job.id, error: msg });
    Jobs.update(job.id, { status: "failed", stage: "failed", stageLabel: labelFor("failed"), error: msg, finishedAt: new Date().toISOString() });
  } finally {
    s.active--;
    setImmediate(tick);
  }
}

function tick() {
  const s = state();
  while (s.active < CONCURRENCY) {
    const job = Jobs.claimNext();
    if (!job) break;
    void runOne(job);
  }
}

/** Start the polling loop (idempotent). Called lazily by API routes and explicitly by scripts. */
export function startRunner() {
  const s = state();
  if (s.timer) return;
  s.timer = setInterval(tick, 1000);
  s.timer.unref?.();
  tick();
}

export function enqueue(type: JobType, payload: Record<string, unknown>): Job {
  const job = Jobs.create(type, payload, labelFor("queued"));
  startRunner();
  setImmediate(tick);
  return job;
}

/** Await a job's completion (scripts/tests). */
export async function waitForJob(id: string, timeoutMs = 30 * 60_000): Promise<Job> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const j = Jobs.get(id);
    if (j && (j.status === "done" || j.status === "failed")) return j;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`job ${id} timed out`);
}
