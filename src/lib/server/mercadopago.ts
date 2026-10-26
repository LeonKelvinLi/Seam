import { randomUUID } from "node:crypto";
import { WebhookSignatureValidator } from "mercadopago";
import { db } from "@/db/client";
import { Events, Purchases, Users } from "@/db/repo";
import { PACKS } from "@/lib/server/billing";
import { publicOrigin } from "@/lib/server/site";

const env = (key: string) => (process.env[key] ?? "").trim();
const API = "https://api.mercadopago.com";
const isLive = () => env("MP_MODE") !== "test";
const validEnvironment = () => ["", "test", "production"].includes(env("MP_MODE"))
  && !(process.env.NODE_ENV === "production" && !isLive()) && !(isLive() && env("MP_ACCESS_TOKEN").startsWith("TEST-"));
// PTAX sale 5.0377 BRL/USD (2026-10-23), rounded upward to a price ending in 9.90, approved by the owner.
const BRAZIL_PRICES: Record<string, number> = { starter: 4990, pro: 14990, studio: 49990 };

export function brazilPriceCents(pack: string): number | null {
  const raw = env(`MP_PRICE_${pack.toUpperCase()}_BRL_CENTS`);
  if (!raw) return BRAZIL_PRICES[pack] ?? null;
  const value = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function mercadoPagoConfigured() {
  return !!(env("MP_ACCESS_TOKEN") && env("MP_WEBHOOK_SECRET") && /^\d+$/.test(env("MP_COLLECTOR_ID"))
    && validEnvironment() && PACKS.every(p => brazilPriceCents(p.id) !== null));
}

/** Only this fixed API origin receives the private token; errors never echo provider payloads. */
async function api(path: string, init: RequestInit, fetcher: typeof fetch) {
  const res = await fetcher(API + path, {
    ...init, headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error",
  });
  if (!res.ok) throw new Error("Mercado Pago is temporarily unavailable. Please try again.");
  return res.json();
}

/** Persist the sold allocation before creating a preference. Later price changes cannot alter receipts. */
export async function mercadoPagoCheckout(userId: string, packId: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!mercadoPagoConfigured()) throw new Error("Payments are temporarily unavailable. Please try again later.");
  const pack = PACKS.find(p => p.id === packId);
  if (!pack || !Users.get(userId)) throw new Error("Unknown credit pack or account.");
  const amountCents = brazilPriceCents(pack.id)!;
  const origin = publicOrigin();
  if (new URL(origin).protocol !== "https:") throw new Error("Checkout requires a secure site address.");
  const orderId = randomUUID();
  db().prepare("INSERT INTO paymentOrders (id,userId,provider,pack,credits,amountCents,currency,createdAt) VALUES (?,?,?,?,?,?,?,?)")
    .run(orderId, userId, "mercadopago", pack.id, pack.credits, amountCents, "BRL", new Date().toISOString());
  const result = await api("/checkout/preferences", {
    method: "POST", headers: { "X-Idempotency-Key": orderId },
    body: JSON.stringify({
      items: [{ id: pack.id, title: `Clipmelt ${pack.name} — ${pack.credits} credits`, quantity: 1, currency_id: "BRL", unit_price: amountCents / 100 }],
      external_reference: orderId,
      back_urls: { success: `${origin}/account?paid=1`, pending: `${origin}/account?payment=pending`, failure: `${origin}/pricing?payment=failed` },
      auto_return: "approved", notification_url: `${origin}/api/mercadopago/webhook`,
      // Hosted Checkout Pro offers enabled Pix/card methods and collects any required buyer identification.
      payment_methods: { installments: 1 },
    }),
  }, fetcher);
  if (String(result.collector_id) !== env("MP_COLLECTOR_ID") || typeof result.id !== "string"
    || (typeof result.live_mode === "boolean" && result.live_mode !== isLive())) throw new Error("Checkout account could not be verified.");
  const target = isLive() ? result.init_point : result.sandbox_init_point;
  const url = new URL(target);
  if (url.protocol !== "https:" || !["www.mercadopago.com.br", "mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(url.hostname)
    || url.username || url.password || url.port) throw new Error("Checkout address could not be verified.");
  db().prepare("UPDATE paymentOrders SET preferenceId=? WHERE id=?").run(result.id, orderId);
  return url.toString();
}

interface Order { id: string; userId: string; provider: string; pack: "starter" | "pro" | "studio"; credits: number; amountCents: number; currency: string }
interface Receipt { orderId: string; revokedCredits: number; refundedCents: number; chargedBack: number }
const cents = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const rounded = Math.round(value * 100);
  return Number.isSafeInteger(rounded) && Math.abs(value * 100 - rounded) < 0.00001 ? rounded : null;
};

/** A notification is only a signed pointer. Fetch current payment state before touching any credits. */
export async function mercadoPagoWebhook(req: Request, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  if (!env("MP_ACCESS_TOKEN") || !env("MP_WEBHOOK_SECRET") || !/^\d+$/.test(env("MP_COLLECTOR_ID")) || !validEnvironment()) {
    throw new Error("Mercado Pago is not configured.");
  }
  const params = new URL(req.url).searchParams;
  const ids = params.getAll("data.id");
  if (ids.length !== 1 || !/^\d+$/.test(ids[0]) || params.getAll("type").length > 1) return { ok: false, message: "invalid notification" };
  const id = ids[0];
  const signature = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!requestId) return { ok: false, message: "invalid signature" };
  try {
    WebhookSignatureValidator.validate({
      xSignature: signature, xRequestId: requestId, dataId: id, secret: env("MP_WEBHOOK_SECRET"),
    });
    // Official examples use both seconds and milliseconds. Preserve the signed value; normalize only for freshness.
    const timestamps = signature.split(",").map(p => p.trim()).filter(p => p.startsWith("ts="));
    const ts = timestamps.length === 1 ? timestamps[0].slice(3).trim() : "";
    if (!/^\d+$/.test(ts) || ![10, 13].includes(ts.length) || Math.abs(Date.now() - Number(ts) * (ts.length === 13 ? 1 : 1000)) > 300_000) {
      return { ok: false, message: "expired signature" };
    }
  } catch { return { ok: false, message: "invalid signature" }; }
  const raw = await req.text();
  if (raw.length > 65536) return { ok: false, message: "invalid notification" };
  let notice: { type?: string; data?: { id?: unknown } };
  try { notice = JSON.parse(raw); } catch { return { ok: false, message: "invalid notification" }; }
  if (!notice || typeof notice !== "object" || notice.type !== "payment" || (params.has("type") && params.get("type") !== "payment")
    || String(notice.data?.id) !== id) return { ok: false, message: "invalid notification" };
  const payment = await api(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" }, fetcher);
  if (String(payment.id) !== id || String(payment.collector_id) !== env("MP_COLLECTOR_ID") || payment.live_mode !== isLive()) {
    return { ok: false, message: "payment account or environment mismatch" };
  }
  const order = db().prepare("SELECT * FROM paymentOrders WHERE id=? AND provider='mercadopago'")
    .get(typeof payment.external_reference === "string" ? payment.external_reference : "") as Order | undefined;
  if (!order) return { ok: true, message: "unrelated payment" };
  if (payment.currency_id !== order.currency || cents(payment.transaction_amount) !== order.amountCents || !Users.get(order.userId)) {
    return { ok: false, message: "payment does not match the order" };
  }
  if (!["approved", "refunded", "charged_back"].includes(payment.status)) return { ok: true, message: "awaiting approved payment" };
  const refunded = payment.status === "refunded" ? order.amountCents : cents(payment.transaction_amount_refunded ?? 0);
  if (refunded === null || refunded > order.amountCents) return { ok: false, message: "invalid refund total" };
  return db().transaction(() => {
    const previous = db().prepare("SELECT * FROM mercadoPagoPayments WHERE paymentId=?").get(id) as Receipt | undefined;
    if (previous && previous.orderId !== order.id) throw new Error("Payment receipt mismatch.");
    const refundTotal = Math.max(previous?.refundedCents ?? 0, refunded);
    const chargedBack = (previous?.chargedBack ?? 0) || Number(payment.status === "charged_back");
    const revoked = chargedBack ? order.credits : Math.min(order.credits, Math.floor(order.credits * refundTotal / order.amountCents));
    const recorded = Purchases.record({ userId: order.userId, provider: "mercadopago", externalId: `mp:${id}`,
      pack: order.pack, amountCents: order.amountCents, currency: order.currency.toLowerCase(), credits: order.credits });
    if (recorded) {
      Users.grant(order.userId, order.credits);
      Users.update(order.userId, { plan: order.pack === "studio" ? "pro" : order.pack });
      Events.track("purchase", { userId: order.userId, props: { provider: "mercadopago", pack: order.pack, amountCents: order.amountCents, currency: "brl", credits: order.credits } });
    }
    const delta = Math.max(0, revoked - (previous?.revokedCredits ?? 0));
    if (delta) Users.grant(order.userId, -delta);
    db().prepare(`INSERT INTO mercadoPagoPayments (paymentId,orderId,revokedCredits,refundedCents,chargedBack) VALUES (?,?,?,?,?)
      ON CONFLICT(paymentId) DO UPDATE SET revokedCredits=excluded.revokedCredits,refundedCents=excluded.refundedCents,chargedBack=excluded.chargedBack`)
      .run(id, order.id, revoked, refundTotal, chargedBack);
    return { ok: true, message: recorded ? "payment recorded" : "payment reconciled" };
  })();
}
