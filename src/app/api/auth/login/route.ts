import { bad, json } from "@/lib/server/session";
import { publicUser, signIn, verifyPassword } from "@/lib/server/auth";
import { Events, Users } from "@/db/repo";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = email ? Users.byEmail(email) : undefined;
  if (!user || !verifyPassword(password ?? "", user.passwordHash)) return bad("Email or password didn't match.", 401);
  await signIn(user);
  Events.track("login", { userId: user.id });
  return json({ user: publicUser(user) });
}
