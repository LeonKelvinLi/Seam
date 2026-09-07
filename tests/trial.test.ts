import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SEAM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "seam-trial-"));
const { Users, FREE_TRIAL_RUNS } = await import("@/db/repo");
const { CREDITS_PER_GENERATION } = await import("@/lib/server/billing");

test("a new guest and a new account each get exactly three free preview runs", () => {
  assert.equal(FREE_TRIAL_RUNS, 3);
  assert.equal(CREDITS_PER_GENERATION.preview, 1);
  for (const u of [Users.ensure("usr_trial_guest"), Users.createAccount("trial@example.com", "scrypt$s$h")]) {
    assert.equal(u.credits, 3);
    assert.equal(Users.spend(u.id, 1), true);
    assert.equal(Users.spend(u.id, 1), true);
    assert.equal(Users.spend(u.id, 1), true);
    assert.equal(Users.spend(u.id, 1), false, "fourth run must be refused");
    assert.equal(Users.get(u.id)?.credits, 0);
  }
});
