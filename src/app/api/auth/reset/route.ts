import { bad, json } from "@/lib/server/session";
import { hashPassword, publicUser, signIn } from "@/lib/server/auth";
import { AuthTokens, Events, Sessions, Users } from "@/db/repo";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  const rl = rateLimit(`auth:${clientIp(req)}`, LIMITS.auth);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token) return bad("This reset link is incomplete.");
  if (!password || password.length < 8) return bad("Use a password with at least 8 characters.");
  const userId = AuthTokens.consume("reset", token);
  const user = userId ? Users.get(userId) : undefined;
  if (!user) return bad("This reset link is invalid or has expired. Request a new one.", 410);
  Users.update(user.id, { passwordHash: hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date().toISOString() });
  Sessions.destroyForUser(user.id);
  const fresh = Users.get(user.id)!;
  await signIn(fresh);
  Events.track("password_reset", { userId: user.id });
  return json({ user: publicUser(fresh) });
}
