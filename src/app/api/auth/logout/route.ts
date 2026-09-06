import { json } from "@/lib/server/session";
import { signOut } from "@/lib/server/auth";

export async function POST() {
  await signOut();
  return json({ ok: true });
}
