import { bad, json } from "@/lib/server/session";
import { AuthTokens, Events, Users } from "@/db/repo";

export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return bad("This verification link is incomplete.");
  const userId = AuthTokens.consume("verify", token);
  if (!userId || !Users.get(userId)) return bad("This verification link is invalid or has expired.", 410);
  Users.update(userId, { emailVerifiedAt: new Date().toISOString() });
  Events.track("email_verified", { userId });
  return json({ ok: true });
}
