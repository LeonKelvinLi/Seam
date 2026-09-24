import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SEAM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "seam-trial-"));
const { Purchases, Users, FREE_TRIAL_RUNS } = await import("@/db/repo");
const { CREDITS_PER_GENERATION } = await import("@/lib/server/billing");

test("a new guest and a new account each get exactly one free preview run", () => {
  assert.equal(FREE_TRIAL_RUNS, 1);
  assert.equal(CREDITS_PER_GENERATION.preview, 2);
  for (const u of [Users.ensure("usr_trial_guest"), Users.createAccount("trial@example.com", "scrypt$s$h")]) {
    assert.equal(u.credits, CREDITS_PER_GENERATION.preview);
    assert.equal(Users.spend(u.id, 2), true);
    assert.equal(Users.spend(u.id, 2), false, "second run must be refused");
    assert.equal(Users.get(u.id)?.credits, 0);
  }
});

test("signing up after using the guest trial does not start a second trial", () => {
  const guest = Users.ensure("usr_trialguest02");
  assert.equal(Users.spend(guest.id, 2), true);
  const account = Users.createAccount("second-trial@example.com", "scrypt$s$h");
  Users.adopt(guest.id, account.id);
  assert.equal(Users.get(account.id)?.credits, 0);
});

test("an unused guest trial carries into the new account once, and bought guest credits always move", () => {
  const guest = Users.ensure("usr_trialguest03");
  const account = Users.createAccount("carry@example.com", "scrypt$s$h");
  Users.adopt(guest.id, account.id);
  assert.equal(Users.get(account.id)?.credits, 2, "one trial, not two");
  assert.equal(Users.get(guest.id)?.credits, 0);

  const payingGuest = Users.ensure("usr_trialguest04");
  Purchases.record({ userId: payingGuest.id, provider: "stripe", externalId: "cs_trial_guest", pack: "starter", amountCents: 900, currency: "usd", credits: 12 });
  Users.grant(payingGuest.id, 12);
  const other = Users.createAccount("paid-guest@example.com", "scrypt$s$h");
  Users.adopt(payingGuest.id, other.id);
  assert.equal(Users.get(other.id)?.credits, 2 + 14);
});
