import { bad, json } from "@/lib/server/session";
import { currentUser } from "@/lib/server/auth";
import { checkoutUrl } from "@/lib/server/billing";
import { Events } from "@/db/repo";
import { paymentProvider } from "@/lib/server/payments";

export async function POST(req: Request) {
  if (paymentProvider() !== "stripe") return bad("Checkout has changed. Refresh this page and try again.", 409);
  const user = await currentUser();
  if (!user) return bad("Sign in to buy credits.", 401);
  const { pack } = (await req.json().catch(() => ({}))) as { pack?: string };
  try {
    const url = await checkoutUrl(user.id, user.email, pack ?? "starter", req);
    if (!url) return bad("Payments are temporarily unavailable. Please try again later.", 503);
    Events.track("checkout_started", { userId: user.id, props: { pack: pack ?? "starter" } });
    return json({ url });
  } catch (e) {
    return bad((e as Error).message, 422);
  }
}
