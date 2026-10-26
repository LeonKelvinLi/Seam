import { bad, json } from "@/lib/server/session";
import { currentUser } from "@/lib/server/auth";
import { paymentCheckout, paymentProvider } from "@/lib/server/payments";
import { Events } from "@/db/repo";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("Sign in to buy credits.", 401);
  const { pack } = (await req.json().catch(() => ({}))) as { pack?: unknown };
  if (typeof pack !== "string" || !["starter", "pro", "studio"].includes(pack)) return bad("Choose a credit pack.");
  try {
    const url = await paymentCheckout(user.id, user.email, pack, req);
    if (!url) return bad("Payments are temporarily unavailable. Please try again later.", 503);
    Events.track("checkout_started", { userId: user.id, props: { pack, provider: paymentProvider() } });
    return json({ url });
  } catch { return bad("Checkout could not open. Please try again later.", 503); }
}
