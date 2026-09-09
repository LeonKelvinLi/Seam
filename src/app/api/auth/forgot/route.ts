import { bad, json } from "@/lib/server/session";
import { validEmail } from "@/lib/server/auth";
import { sendPasswordReset } from "@/lib/server/account-mail";
import { mailConfigured } from "@/lib/server/mail";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

/** Always answers the same way so the endpoint cannot be used to test which emails have accounts. */
export async function POST(req: Request) {
  const rl = rateLimit(`auth:${clientIp(req)}`, LIMITS.auth);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email || !validEmail(email)) return bad("Enter a valid email address.");
  await sendPasswordReset(email);
  return json({ ok: true, delivery: mailConfigured() ? "email" : "unconfigured" });
}
