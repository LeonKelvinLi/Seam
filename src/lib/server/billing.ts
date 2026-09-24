/**
 * Credits and Stripe. Two ways to sell credit packs:
 *  1. Stripe Checkout sessions created here (needs STRIPE_SECRET_KEY + STRIPE_PRICE_<PACK>).
 *  2. Stripe Payment Links pasted into STRIPE_LINK_<PACK>; we append client_reference_id so the webhook can credit the account.
 * Either way the webhook (checkout.session.completed) is what grants credits, idempotently by session id.
 */
import Stripe from "stripe";
import { db } from "@/db/client";
import { Events, Purchases, Users } from "@/db/repo";
import { logger } from "@/core/log";

const log = logger("billing");
const env = (k: string) => (process.env[k] ?? "").trim();

export interface Pack { id: "starter" | "pro" | "studio"; name: string; credits: number; priceUsd: number; blurb: string }
export const PACKS: Pack[] = [
  // Credit maths (2026-09-24): a preview costs 2 credits. Measured on production, an accepted preview costs about
  // $0.40-0.60 in provider and judge fees, and Stripe keeps 2.9% + $0.30. At $1.50 / $1.32 / $1.16 per preview every
  // pack keeps roughly 50-65% gross margin even when all of its credits are used.
  { id: "starter", name: "Starter", credits: 12, priceUsd: 9, blurb: "6 AI transitions. Try it on your next Reel." },
  { id: "pro", name: "Pro", credits: 44, priceUsd: 29, blurb: "22 transitions, or 7 final-quality renders." },
  { id: "studio", name: "Studio", credits: 170, priceUsd: 99, blurb: "85 transitions for teams and agencies." },
];
/** Packs sold before the 2026-09-24 repricing. A checkout opened on an old link can still complete, and must still be credited. */
const LEGACY_PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 30, priceUsd: 9, blurb: "" },
  { id: "pro", name: "Pro", credits: 120, priceUsd: 29, blurb: "" },
  { id: "studio", name: "Studio", credits: 400, priceUsd: 89, blurb: "" },
];

/** The pack a completed checkout paid for: pack id, amount and credit count must all agree with one sold pack. */
export function packForCheckout(amountCents: number | null, metaPack?: string, metaCredits?: string): Pack | undefined {
  const credits = metaCredits ? Number(metaCredits) : undefined;
  const matches = (p: Pack) => Math.round(p.priceUsd * 100) === amountCents && (!metaPack || p.id === metaPack) && (credits === undefined || p.credits === credits);
  // Without a credit count in the metadata only the current packs are trusted; old links always carried one.
  return PACKS.find(matches) ?? (credits !== undefined ? LEGACY_PACKS.find(matches) : undefined);
}
export const CREDITS_PER_GENERATION: Record<"preview" | "final", number> = { preview: 2, final: 6 };

let stripeClient: Stripe | null = null;
export function stripe(): Stripe | null {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function billingStatus() {
  return {
    checkout: !!env("STRIPE_SECRET_KEY") && PACKS.some((p) => env(`STRIPE_PRICE_${p.id.toUpperCase()}`)),
    links: PACKS.filter((p) => env(`STRIPE_LINK_${p.id.toUpperCase()}`)).map((p) => p.id),
    webhook: !!env("STRIPE_WEBHOOK_SECRET"),
  };
}

export function appUrl(req: Request) {
  return env("NEXT_PUBLIC_APP_URL") || env("SEAM_PUBLIC_URL") || new URL(req.url).origin;
}

/** Returns a URL the browser should open to pay for a pack, or null when nothing is configured. */
export async function checkoutUrl(userId: string, email: string | null, packId: string, req: Request): Promise<string | null> {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack");
  const link = env(`STRIPE_LINK_${pack.id.toUpperCase()}`);
  const price = env(`STRIPE_PRICE_${pack.id.toUpperCase()}`);
  const s = stripe();
  if (s && price) {
    const session = await s.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      customer_email: email ?? undefined,
      metadata: { userId, pack: pack.id, credits: String(pack.credits) },
      success_url: `${appUrl(req)}/account?paid=1`,
      cancel_url: `${appUrl(req)}/pricing?canceled=1`,
    });
    return session.url ?? null;
  }
  if (link) {
    const u = new URL(link);
    u.searchParams.set("client_reference_id", userId);
    if (email) u.searchParams.set("prefilled_email", email);
    return u.toString();
  }
  return null;
}

/** Verify and apply a Stripe webhook payload. Returns what happened, for logging. */
export function handleWebhook(rawBody: string, signature: string | null): { ok: boolean; message: string } {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) return { ok: false, message: "Stripe webhook not configured" };
  // Signature verification is local HMAC work; it needs a client object, not a live API key, so Payment Link
  // purchases are credited even before STRIPE_SECRET_KEY is set.
  const s = stripe() ?? new Stripe("sk_verification_only");
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch (e) {
    return { ok: false, message: `signature failed: ${(e as Error).message}` };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentId = objectId(charge.payment_intent);
    if (!paymentId) return { ok: true, message: "refund without payment intent" };
    if (!Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0) {
      return { ok: false, message: "invalid refund amount" };
    }
    return db().transaction(() => {
      // Stripe retries and delivers events out of order. Keep the largest cumulative total per charge.
      db().prepare(`INSERT INTO stripeRefundTotals (chargeId, paymentIntentId, amountRefunded, currency) VALUES (?,?,?,?)
        ON CONFLICT(chargeId) DO UPDATE SET amountRefunded=MAX(amountRefunded, excluded.amountRefunded)`)
        .run(charge.id, paymentId, charge.amount_refunded, charge.currency);
      const revoked = reconcileRefund(paymentId);
      return { ok: true, message: `refund recorded; revoked ${revoked} credits` };
    })();
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return { ok: true, message: `ignored ${event.type}` };
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return { ok: true, message: "awaiting payment" };
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
  if (!userId || !Users.get(userId)) return { ok: true, message: "no matching user" };
  const pack = packForCheckout(session.amount_total, session.metadata?.pack, session.metadata?.credits);
  if (!pack || session.currency !== "usd") return { ok: false, message: "unrecognized credit purchase" };
  const paymentId = objectId(session.payment_intent);
  if (!paymentId) return { ok: false, message: "missing payment intent" };
  return db().transaction(() => {
    // Grant and receipt commit together; an interrupted webhook cannot lose the credits.
    const recorded = Purchases.record({
      userId, provider: "stripe", externalId: session.id, pack: pack.id,
      amountCents: session.amount_total!, currency: session.currency!, credits: pack.credits,
    });
    db().prepare("INSERT OR IGNORE INTO stripePayments (paymentIntentId, sessionId) VALUES (?,?)").run(paymentId, session.id);
    if (recorded) {
      Users.grant(userId, pack.credits);
      Users.update(userId, { plan: pack.id === "studio" ? "pro" : pack.id, stripeCustomerId: objectId(session.customer) });
      Events.track("purchase", { userId, props: { pack: pack.id, amountCents: session.amount_total!, currency: session.currency!, credits: pack.credits } });
      log.info("credits granted", { userId, credits: pack.credits, pack: pack.id });
    }
    // Also handles a refund delivered before checkout completion.
    reconcileRefund(paymentId);
    return { ok: true, message: recorded ? `granted ${pack.credits} credits` : "already applied" };
  })();
}

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

/** Must run within the receipt transaction. A negative balance preserves debt for already-spent credits. */
function reconcileRefund(paymentId: string): number {
  const payment = db().prepare(`SELECT p.userId, p.credits, p.amountCents, p.currency, s.revokedCredits
    FROM stripePayments s JOIN purchases p ON p.externalId=s.sessionId WHERE s.paymentIntentId=?`)
    .get(paymentId) as { userId: string; credits: number; amountCents: number; currency: string; revokedCredits: number } | undefined;
  if (!payment || payment.amountCents <= 0) return 0;
  const { amount } = db().prepare("SELECT COALESCE(SUM(amountRefunded),0) amount FROM stripeRefundTotals WHERE paymentIntentId=? AND currency=?")
    .get(paymentId, payment.currency) as { amount: number };
  const target = Math.min(payment.credits, Math.floor(payment.credits * amount / payment.amountCents));
  const delta = Math.max(0, target - payment.revokedCredits);
  if (delta) {
    Users.grant(payment.userId, -delta);
    db().prepare("UPDATE stripePayments SET revokedCredits=? WHERE paymentIntentId=?").run(target, paymentId);
    log.info("refunded credits revoked", { userId: payment.userId, credits: delta });
  }
  return delta;
}
