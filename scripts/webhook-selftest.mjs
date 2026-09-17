#!/usr/bin/env node
/**
 * Proves the deployed Stripe webhook credits an account, without a purchase: signs a synthetic
 * checkout.session.completed event with STRIPE_WEBHOOK_SECRET from .env.local and posts it.
 *   node scripts/webhook-selftest.mjs <userId> [baseUrl]
 * The secret is read by this process only and never printed.
 */
import fs from "node:fs";
import { createHmac } from "node:crypto";

const [userId, base = "https://seamcut.onrender.com"] = process.argv.slice(2);
if (!userId) { console.error("usage: node scripts/webhook-selftest.mjs <userId> [baseUrl]"); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const secret = env.STRIPE_WEBHOOK_SECRET;
if (!secret) { console.error("STRIPE_WEBHOOK_SECRET missing from .env.local"); process.exit(1); }
const sessionId = `cs_selftest_${Date.now()}`;
const event = { id: `evt_selftest_${Date.now()}`, object: "event", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: false,
  data: { object: { id: sessionId, payment_intent: `pi_selftest_${Date.now()}`, object: "checkout.session", client_reference_id: userId, amount_total: 900, currency: "usd", customer: null, metadata: { pack: "starter", credits: "30", selftest: "1" }, payment_status: "paid" } } };
const payload = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
const res = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` }, body: payload });
console.log(`webhook -> ${res.status} ${(await res.text()).slice(0, 200)} (session ${sessionId})`);
