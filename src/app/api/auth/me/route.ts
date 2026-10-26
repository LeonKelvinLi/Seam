import { json } from "@/lib/server/session";
import { currentUser, publicUser } from "@/lib/server/auth";
import { Purchases } from "@/db/repo";
import { CREDITS_PER_GENERATION } from "@/lib/server/billing";
import { paymentPacks, paymentStatus } from "@/lib/server/payments";
import { googleConfigured } from "@/lib/server/google";

export async function GET() {
  const u = await currentUser();
  return json({
    user: u ? publicUser(u) : null,
    purchases: u ? Purchases.forUser(u.id).map((p) => ({ id: p.id, pack: p.pack, credits: p.credits, amountCents: p.amountCents, currency: p.currency, createdAt: p.createdAt })) : [],
    packs: paymentPacks(), creditsPerGeneration: CREDITS_PER_GENERATION, billing: paymentStatus(), auth: { google: googleConfigured() },
  });
}
