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
  return { id: `cs_${id}`, payment_intent: `pi_${id}`, client_reference_id: id, payment_status: "paid", amount_total: 900, currency: "usd", customer: null, metadata: { pack: "starter", credits: "30" }, ...extra };
}
function refund(id: string, amount: number) {
  return deliver("charge.refunded", { id: `ch_${id}`, payment_intent: `pi_${id}`, amount_refunded: amount, currency: "usd" });
}
test("paid receipt and full refund are idempotent, including after credits were spent", () => {
  const session = purchase("paid");
  assert.equal(deliver("checkout.session.completed", session).ok, true);
  assert.equal(deliver("checkout.session.completed", session).message, "already applied");
  assert.equal(Users.get("paid")?.credits, 36);
  Users.spend("paid", 34);
  refund("paid", 900); refund("paid", 900);
  assert.equal(Users.get("paid")?.credits, -28);
  assert.equal(Users.spend("paid", 2), false);
  deliver("checkout.session.completed", session);
  assert.equal(Users.get("paid")?.credits, -28);
});
test("partial refunds use cumulative proportional credits and ignore older events", () => {
  deliver("checkout.session.completed", purchase("partial"));
  refund("partial", 300);
  assert.equal(Users.get("partial")?.credits, 26);
  refund("partial", 600); refund("partial", 300);
  assert.equal(Users.get("partial")?.credits, 16);
  refund("partial", 900);
  assert.equal(Users.get("partial")?.credits, 6);
});
test("refund arriving before payment is reconciled when payment arrives", () => {
  refund("early", 900);
  deliver("checkout.session.completed", purchase("early"));
  assert.equal(Users.get("early")?.credits, 6);
});
test("delayed payment is credited only after success", () => {
  const session = purchase("delayed", { payment_status: "unpaid" });
  deliver("checkout.session.completed", session);
  assert.equal(Users.get("delayed")?.credits, 6);
  deliver("checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" });
  assert.equal(Users.get("delayed")?.credits, 36);
});
test("invalid signature and unknown price/currency cannot grant credits", () => {
  assert.equal(handleWebhook("{}", "wrong").ok, false);
  assert.equal(deliver("checkout.session.completed", purchase("bad-price", { amount_total: 1 })).ok, false);
  assert.equal(deliver("checkout.session.completed", purchase("bad-currency", { currency: "eur" })).ok, false);
  assert.equal(Users.get("bad-price")?.credits, 6);
});
test("failed receipt transaction rolls back the credit grant and can retry", () => {
  const session = purchase("rollback");
  db().exec("CREATE TRIGGER fail_grant BEFORE UPDATE OF credits ON users BEGIN SELECT RAISE(ABORT,'test interruption'); END");
  assert.throws(() => deliver("checkout.session.completed", session));
  assert.equal((db().prepare("SELECT COUNT(*) n FROM purchases WHERE externalId=?").get(session.id) as { n: number }).n, 0);
  db().exec("DROP TRIGGER fail_grant");
  assert.equal(deliver("checkout.session.completed", session).ok, true);
  assert.equal(Users.get("rollback")?.credits, 36);
});
