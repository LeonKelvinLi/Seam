import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-maint-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Users, Projects, Jobs } = await import("@/db/repo");
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

test("database backup writes one file per day and keeps the store readable", async () => {
  const dest = await backupDatabase();
  assert.ok(dest && fs.existsSync(dest) && fs.statSync(dest).size > 0);
  assert.equal(await backupDatabase(), null);
});
