import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Stripe from "stripe";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-billing-"));
process.env.SEAM_DATA_DIR = dir;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test";
delete process.env.STRIPE_SECRET_KEY;
const { db } = await import("@/db/client");
const { Users } = await import("@/db/repo");
const { handleWebhook } = await import("@/lib/server/billing");
const sdk = new Stripe("sk_test_local");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });
function deliver(type: string, object: object) {
  const payload = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object } });
  return handleWebhook(payload, sdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! }));
}
function purchase(id: string, extra = {}) {
  Users.ensure(id);
  return { id: `cs_${id}`, payment_intent: `pi_${id}`, client_reference_id: id, payment_status: "paid", amount_total: 900, currency: "usd", customer: null, metadata: { pack: "starter", credits: "12" }, ...extra };
}
function refund(id: string, amount: number) {
  return deliver("charge.refunded", { id: `ch_${id}`, payment_intent: `pi_${id}`, amount_refunded: amount, currency: "usd" });
}
test("paid receipt and full refund are idempotent, including after credits were spent", () => {
  const session = purchase("paid");
  assert.equal(deliver("checkout.session.completed", session).ok, true);
  assert.equal(deliver("checkout.session.completed", session).message, "already applied");
  assert.equal(Users.get("paid")?.credits, 14);
  Users.spend("paid", 12);
  refund("paid", 900); refund("paid", 900);
  assert.equal(Users.get("paid")?.credits, -10);
  assert.equal(Users.spend("paid", 2), false);
  deliver("checkout.session.completed", session);
  assert.equal(Users.get("paid")?.credits, -10);
});
test("partial refunds use cumulative proportional credits and ignore older events", () => {
  deliver("checkout.session.completed", purchase("partial"));
  refund("partial", 300);
  assert.equal(Users.get("partial")?.credits, 10);
  refund("partial", 600); refund("partial", 300);
  assert.equal(Users.get("partial")?.credits, 6);
  refund("partial", 900);
  assert.equal(Users.get("partial")?.credits, 2);
});
test("refund arriving before payment is reconciled when payment arrives", () => {
  refund("early", 900);
  deliver("checkout.session.completed", purchase("early"));
  assert.equal(Users.get("early")?.credits, 2);
});
test("delayed payment is credited only after success", () => {
  const session = purchase("delayed", { payment_status: "unpaid" });
  deliver("checkout.session.completed", session);
  assert.equal(Users.get("delayed")?.credits, 2);
  deliver("checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" });
  assert.equal(Users.get("delayed")?.credits, 14);
});
test("invalid signature and unknown price/currency cannot grant credits", () => {
  assert.equal(handleWebhook("{}", "wrong").ok, false);
  assert.equal(deliver("checkout.session.completed", purchase("bad-price", { amount_total: 1 })).ok, false);
  assert.equal(deliver("checkout.session.completed", purchase("bad-currency", { currency: "eur" })).ok, false);
  assert.equal(Users.get("bad-price")?.credits, 2);
  // Right price, wrong credit count: the metadata must match a sold pack exactly.
  assert.equal(deliver("checkout.session.completed", purchase("bad-credits", { metadata: { pack: "starter", credits: "999" } })).ok, false);
  assert.equal(Users.get("bad-credits")?.credits, 2);
});
test("a checkout opened on a pre-repricing link is still credited at its old size", () => {
  assert.equal(deliver("checkout.session.completed", purchase("legacy", { metadata: { pack: "starter", credits: "30" } })).ok, true);
  assert.equal(Users.get("legacy")?.credits, 32);
  // Old Studio link: $89 for 400 credits.
  assert.equal(deliver("checkout.session.completed", purchase("legacy-studio", { amount_total: 8900, metadata: { pack: "studio", credits: "400" } })).ok, true);
  assert.equal(Users.get("legacy-studio")?.credits, 402);
  // Without a credit count only the current packs are trusted.
  assert.equal(deliver("checkout.session.completed", purchase("legacy-bare", { amount_total: 8900, metadata: {} })).ok, false);
});
test("failed receipt transaction rolls back the credit grant and can retry", () => {
  const session = purchase("rollback");
  db().exec("CREATE TRIGGER fail_grant BEFORE UPDATE OF credits ON users BEGIN SELECT RAISE(ABORT,'test interruption'); END");
  assert.throws(() => deliver("checkout.session.completed", session));
  assert.equal((db().prepare("SELECT COUNT(*) n FROM purchases WHERE externalId=?").get(session.id) as { n: number }).n, 0);
  db().exec("DROP TRIGGER fail_grant");
  assert.equal(deliver("checkout.session.completed", session).ok, true);
  assert.equal(Users.get("rollback")?.credits, 14);
});
