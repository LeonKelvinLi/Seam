import { bad, json } from "@/lib/server/session";
import { hashPassword, publicUser, signIn, validEmail } from "@/lib/server/auth";
import { Events, Users } from "@/db/repo";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  const rl = rateLimit(`auth:${clientIp(req)}`, LIMITS.auth);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !validEmail(email)) return bad("Enter a valid email address.");
  if (!password || password.length < 8) return bad("Use a password with at least 8 characters.");
  if (Users.byEmail(email)) return bad("That email already has an account. Sign in instead.", 409);
  const user = Users.createAccount(email, hashPassword(password));
  await signIn(user);
  Events.track("signup", { userId: user.id });
  return json({ user: publicUser(user) });
}
