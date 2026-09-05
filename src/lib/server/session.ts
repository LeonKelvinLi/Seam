import { cookies } from "next/headers";
import { newId } from "@/core/ids";
import { Users } from "@/db/repo";

const COOKIE = "seam_uid";

/** Anonymous user identity via a long-lived cookie. Swap for real auth later without touching routes. */
export async function getUserId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !/^usr_[a-z0-9]{12}$/.test(id)) {
    id = newId("usr");
    try {
      jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    } catch {
      /* read-only context (server component) */
    }
  }
  Users.ensure(id);
  return id;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
