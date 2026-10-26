import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipmelt-mp-"));
Object.assign(process.env, { SEAM_DATA_DIR: dir, SEAM_PUBLIC_URL: "https://clipmelt.test", MP_MODE: "test",
  MP_ACCESS_TOKEN: "TEST-private-fixture", MP_WEBHOOK_SECRET: "fixture-secret", MP_COLLECTOR_ID: "1234" });
const { db } = await import("@/db/client");
const { Users } = await import("@/db/repo");
const { mercadoPagoCheckout, mercadoPagoWebhook, mercadoPagoConfigured } = await import("@/lib/server/mercadopago");
const { paymentStatus, paymentPacks } = await import("@/lib/server/payments");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });
let sequence = 100;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function order(userId: string) {
  Users.ensure(userId);
  let body: any;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://api.mercadopago.com/checkout/preferences");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer TEST-private-fixture");
    body = JSON.parse(String(init?.body));
    return response({ id: `pref-${sequence++}`, collector_id: 1234, init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture",
      sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture" });
  };
  const url = await mercadoPagoCheckout(userId, "starter", fetcher);
  return { body, url, id: String(sequence++), userId, external_reference: body.external_reference };
}
type Fixture = Awaited<ReturnType<typeof order>>;
function payment(o: Fixture, extra = {}) {
  return { id: o.id, collector_id: 1234, live_mode: false, external_reference: o.external_reference,
    transaction_amount: 49.9, transaction_amount_refunded: 0, currency_id: "BRL", status: "approved", ...extra };
}
function request(id: string, opts: { ts?: string; signature?: string; query?: string; body?: any } = {}) {
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.MP_WEBHOOK_SECRET!).update(`id:${id};request-id:fixture-request;ts:${ts};`).digest("hex");
  return new Request(`https://clipmelt.test/api/mercadopago/webhook?data.id=${id}&type=payment${opts.query ?? ""}`, {
    method: "POST", headers: { "x-signature": opts.signature ?? `ts=${ts},v1=${signature}`, "x-request-id": "fixture-request" },
    body: JSON.stringify(opts.body ?? { type: "payment", data: { id } }),
  });
}
const deliver = (o: Fixture, data: object) => mercadoPagoWebhook(request(o.id), async () => response(data));

test("checkout persists a BRL allocation and sends no buyer personal data to the preferences API", async () => {
  const o = await order("checkout");
  assert.equal(o.body.items[0].unit_price, 49.9);
  assert.equal(o.body.items[0].currency_id, "BRL");
  assert.equal(o.body.items[0].quantity, 1);
  assert.equal(o.body.payer, undefined);
  assert.equal(o.body.notification_url, "https://clipmelt.test/api/mercadopago/webhook");
  assert.equal(new URL(o.url).hostname, "sandbox.mercadopago.com.br");
  const saved: any = db().prepare("SELECT * FROM paymentOrders WHERE id=?").get(o.external_reference);
  assert.equal(saved.credits, 12); assert.equal(saved.amountCents, 4990); assert.equal(saved.userId, "checkout");
});
test("pending Pix grants nothing; approval and duplicate deliveries grant exactly once", async () => {
  const o = await order("pix");
  await deliver(o, payment(o, { status: "pending" }));
  assert.equal(Users.get(o.userId)?.credits, 2);
  await deliver(o, payment(o)); await deliver(o, payment(o));
  assert.equal(Users.get(o.userId)?.credits, 14);
  assert.equal((db().prepare("SELECT COUNT(*) n FROM purchases WHERE userId=?").get(o.userId) as any).n, 1);
});
test("partial refunds are monotonic; full refund after spending can create debt, never double-debit", async () => {
  const o = await order("refunds"); await deliver(o, payment(o));
  await deliver(o, payment(o, { transaction_amount_refunded: 19.96 }));
  assert.equal(Users.get(o.userId)?.credits, 10);
  await deliver(o, payment(o, { transaction_amount_refunded: 39.92 }));
  await deliver(o, payment(o, { transaction_amount_refunded: 19.96 }));
  assert.equal(Users.get(o.userId)?.credits, 5);
  Users.spend(o.userId, 4);
  await deliver(o, payment(o, { status: "refunded", transaction_amount_refunded: 49.9 }));
  await deliver(o, payment(o, { status: "refunded" })); await deliver(o, payment(o));
  assert.equal(Users.get(o.userId)?.credits, -2);
  assert.equal(Users.spend(o.userId, 2), false);
});
test("refund-first and chargeback-first delivery never leaves spendable purchased credits", async () => {
  for (const status of ["refunded", "charged_back"]) {
    const o = await order(status); await deliver(o, payment(o, { status }));
    await deliver(o, payment(o));
    assert.equal(Users.get(o.userId)?.credits, 2);
  }
});
test("receipt uses the sold price even after repricing; unrecognized currency, amount, collector, mode and id fail closed", async () => {
  const o = await order("validation");
  for (const patch of [{ currency_id: "USD" }, { transaction_amount: 1 }, { collector_id: 5678 }, { live_mode: true }, { id: "999999" }]) {
    assert.equal((await deliver(o, payment(o, patch))).ok, false);
    assert.equal(Users.get(o.userId)?.credits, 2);
  }
  process.env.MP_PRICE_STARTER_BRL_CENTS = "9990";
  assert.equal((await deliver(o, payment(o))).ok, true);
  delete process.env.MP_PRICE_STARTER_BRL_CENTS;
  assert.equal(Users.get(o.userId)?.credits, 14);
});
test("invalid, stale, ambiguous or body-mismatched notifications cannot initiate an API request", async () => {
  const o = await order("signature"); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return response(payment(o)); };
  for (const opts of [{ signature: "wrong" }, { ts: "1700000000" }, { query: `&data.id=${o.id}` },
    { body: { type: "payment", data: { id: "999999" } } }]) {
    assert.equal((await mercadoPagoWebhook(request(o.id, opts), fetcher)).ok, false);
  }
  assert.equal(calls, 0);
  assert.equal((await mercadoPagoWebhook(request(o.id, { ts: String(Date.now()) }), fetcher)).ok, true);
  assert.equal((await mercadoPagoWebhook(request(o.id), fetcher)).ok, true);
  assert.equal(Users.get(o.userId)?.credits, 14);
});
test("provider/API failure and a failed database transaction can retry without losing or duplicating credit", async () => {
  const o = await order("retry");
  await assert.rejects(mercadoPagoWebhook(request(o.id), async () => response({}, 503)), /temporarily unavailable/);
  db().exec("CREATE TRIGGER mp_fail_grant BEFORE UPDATE OF credits ON users BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(deliver(o, payment(o)));
  assert.equal((db().prepare("SELECT COUNT(*) n FROM purchases WHERE externalId=?").get(`mp:${o.id}`) as any).n, 0);
  db().exec("DROP TRIGGER mp_fail_grant");
  await deliver(o, payment(o)); await deliver(o, payment(o));
  assert.equal(Users.get(o.userId)?.credits, 14);
});
test("selector switches currency and fails closed without credentials or with invalid prices", async () => {
  process.env.SEAM_PAYMENT_PROVIDER = "mercadopago";
  assert.equal(paymentPacks()[0].currency, "BRL"); assert.equal(paymentPacks()[0].priceAmount, 49.9);
  assert.equal(mercadoPagoConfigured(), true);
  process.env.MP_PRICE_STARTER_BRL_CENTS = "invalid";
  assert.equal(paymentStatus().checkout, false); assert.equal(paymentPacks()[0].priceAmount, null);
  await assert.rejects(mercadoPagoCheckout("checkout", "starter"));
  delete process.env.MP_PRICE_STARTER_BRL_CENTS;
  process.env.SEAM_PAYMENT_PROVIDER = "invalid"; assert.equal(paymentStatus().checkout, false);
  delete process.env.SEAM_PAYMENT_PROVIDER; assert.equal(paymentPacks()[0].currency, "USD");
});
test("production never enables sandbox purchases and untrusted checkout destinations are rejected", async () => {
  const before = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal(mercadoPagoConfigured(), false);
  if (before === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: before });
  for (const result of [
    { collector_id: 1234, sandbox_init_point: "https://attacker.test/pay" },
    { collector_id: 9999, sandbox_init_point: "https://sandbox.mercadopago.com.br/pay" },
    { collector_id: 1234, sandbox_init_point: "http://sandbox.mercadopago.com.br/pay" },
  ]) await assert.rejects(mercadoPagoCheckout("checkout", "starter", async () => response({ id: "untrusted", ...result })));
});
