/**
 * Accounts: email + password (scrypt), opaque session ids in an httpOnly cookie, guests adopted on sign-in.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { Sessions, Users } from "@/db/repo";
import type { User } from "@/core/types";

export const SESSION_COOKIE = "seam_session";
const GUEST_COOKIE = "seam_uid";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function validEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = Sessions.get(sid);
  if (!s) return null;
  return Users.get(s.userId) ?? null;
}

/** Start a session and fold the guest's work into the account. */
export async function signIn(user: User) {
  const jar = await cookies();
  const guest = jar.get(GUEST_COOKIE)?.value;
  if (guest && guest !== user.id && Users.get(guest)) Users.adopt(guest, user.id);
  const s = Sessions.create(user.id);
  jar.set(SESSION_COOKIE, s.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
  jar.set(GUEST_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function signOut() {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) Sessions.destroy(sid);
  jar.delete(SESSION_COOKIE);
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, credits: u.credits, plan: u.plan, createdAt: u.createdAt };
}
