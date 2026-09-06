/**
 * Credits and Stripe. Two ways to sell credit packs:
 *  1. Stripe Checkout sessions created here (needs STRIPE_SECRET_KEY + STRIPE_PRICE_<PACK>).
 *  2. Stripe Payment Links pasted into STRIPE_LINK_<PACK>; we append client_reference_id so the webhook can credit the account.
 * Either way the webhook (checkout.session.completed) is what grants credits, idempotently by session id.
 */
import Stripe from "stripe";
import { Purchases, Users } from "@/db/repo";
import { logger } from "@/core/log";

const log = logger("billing");
const env = (k: string) => (process.env[k] ?? "").trim();

export interface Pack { id: "starter" | "pro" | "studio"; name: string; credits: number; priceUsd: number; blurb: string }
export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 50, priceUsd: 9, blurb: "50 transitions. Enough for a week of Reels." },
  { id: "pro", name: "Pro", credits: 250, priceUsd: 29, blurb: "250 transitions, final-quality models unlocked." },
  { id: "studio", name: "Studio", credits: 1000, priceUsd: 89, blurb: "1,000 transitions for teams and agencies." },
];
export const CREDITS_PER_GENERATION: Record<"preview" | "final", number> = { preview: 1, final: 3 };

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
  const s = stripe();
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!s || !secret) return { ok: false, message: "Stripe webhook not configured" };
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch (e) {
    return { ok: false, message: `signature failed: ${(e as Error).message}` };
  }
  if (event.type !== "checkout.session.completed") return { ok: true, message: `ignored ${event.type}` };
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
  if (!userId || !Users.get(userId)) return { ok: true, message: "no matching user" };
  const packId = session.metadata?.pack ?? PACKS.find((p) => Math.round(p.priceUsd * 100) === (session.amount_total ?? -1))?.id ?? "starter";
  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[0];
  const credits = Number(session.metadata?.credits ?? pack.credits);
  const recorded = Purchases.record({
    userId, provider: "stripe", externalId: session.id, pack: pack.id, amountCents: session.amount_total ?? Math.round(pack.priceUsd * 100),
    currency: session.currency ?? "usd", credits,
  });
  if (!recorded) return { ok: true, message: "already applied" };
  Users.grant(userId, credits);
  Users.update(userId, { plan: pack.id === "studio" ? "pro" : pack.id, stripeCustomerId: typeof session.customer === "string" ? session.customer : null });
  log.info("credits granted", { userId, credits, pack: pack.id });
  return { ok: true, message: `granted ${credits} credits` };
}
