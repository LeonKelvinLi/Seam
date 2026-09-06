import { bad, json } from "@/lib/server/session";
import { currentUser } from "@/lib/server/auth";
import { checkoutUrl } from "@/lib/server/billing";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("Sign in to buy credits.", 401);
  const { pack } = (await req.json().catch(() => ({}))) as { pack?: string };
  try {
    const url = await checkoutUrl(user.id, user.email, pack ?? "starter", req);
    if (!url) return bad("Payments aren't set up yet. Add STRIPE_SECRET_KEY and a price id, or a payment link, to .env.local.", 503);
    return json({ url });
  } catch (e) {
    return bad((e as Error).message, 422);
  }
}
