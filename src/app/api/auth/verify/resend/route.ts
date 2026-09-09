import { bad, json } from "@/lib/server/session";
import { currentUser } from "@/lib/server/auth";
import { sendVerification } from "@/lib/server/account-mail";
import { mailConfigured } from "@/lib/server/mail";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  const rl = rateLimit(`auth:${clientIp(req)}`, LIMITS.auth);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const user = await currentUser();
  if (!user?.email) return bad("Sign in first.", 401);
  if (user.emailVerifiedAt) return json({ ok: true, alreadyVerified: true });
  const sent = await sendVerification(user);
  return json({ ok: true, sent, delivery: mailConfigured() ? "email" : "unconfigured" });
}
