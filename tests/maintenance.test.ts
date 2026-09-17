import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_FINE_TUNE, type Generation } from "@/core/types";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-maint-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Users, Projects, Jobs, Generations } = await import("@/db/repo");
const { sweepGuestProjects, backupDatabase } = await import("@/lib/server/maintenance");

test("guest projects past retention are deleted while account projects stay", () => {
  const guest = Users.ensure("usr_guest_retention");
  const account = Users.createAccount("keep@example.com", "scrypt$salt$hash");
  const old = Projects.create(guest.id, "old guest project");
  const fresh = Projects.create(guest.id, "fresh guest project");
  const kept = Projects.create(account.id, "account project");
  db().prepare("UPDATE projects SET updatedAt=? WHERE id=?").run(new Date(Date.now() - 40 * 86_400_000).toISOString(), old.id);
  db().prepare("UPDATE projects SET updatedAt=? WHERE id=?").run(new Date(Date.now() - 40 * 86_400_000).toISOString(), kept.id);
  assert.equal(sweepGuestProjects(30), 1);
  assert.equal(Projects.get(old.id), undefined);
  assert.ok(Projects.get(fresh.id));
  assert.ok(Projects.get(kept.id));
});

test("jobs left running by a dead process are requeued on boot", () => {
  const job = Jobs.create("analyze", { projectId: "none" });
  Jobs.claimNext();
  assert.equal(Jobs.get(job.id)?.status, "running");
  assert.equal(Jobs.requeueStale(), 1);
  assert.equal(Jobs.get(job.id)?.status, "queued");
});

test("finished generations a late fan-out attempt left running are restored on boot", () => {
  const finished = Jobs.create("generate", {});
  Jobs.update(finished.id, { status: "done" });
  const inFlight = Jobs.create("generate", {});
  Jobs.update(inFlight.id, { status: "running" });
  const row = {
    projectId: "prj_restore", opportunityId: "opp_restore", recipeId: "dissolve-match", intent: "smooth", fineTune: DEFAULT_FINE_TUNE, mode: "preview",
    status: "running", stage: "judge", stageLabel: "Checking the result", progress: 0.55, friendlyError: null, parentGenerationId: null,
  } as const;
  const result = { fullPath: "full.mp4", bridgePath: "transition.mp4", posterPath: "poster.jpg" } as Generation["result"];
  const stuck = Generations.create({ ...row, result, jobId: finished.id });
  const rendering = Generations.create({ ...row, result: null, jobId: inFlight.id });
  const failed = Generations.create({ ...row, status: "failed", result, jobId: finished.id });
  assert.equal(Generations.restoreFinished(), 1);
  assert.equal(Generations.get(stuck.id)?.status, "ready");
  assert.equal(Generations.get(stuck.id)?.stage, "ready");
  assert.equal(Generations.get(stuck.id)?.progress, 1);
  assert.equal(Generations.get(rendering.id)?.status, "running");
  assert.equal(Generations.get(failed.id)?.status, "failed");
  assert.equal(Generations.restoreFinished(), 0);
});

test("database backup writes one file per day and keeps the store readable", async () => {
  const dest = await backupDatabase();
  assert.ok(dest && fs.existsSync(dest) && fs.statSync(dest).size > 0);
  assert.equal(await backupDatabase(), null);
});
