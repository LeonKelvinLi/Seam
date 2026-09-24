/**
 * One free trial per person can't be enforced by cookies alone: clearing them, a private window or a new email
 * account starts a fresh guest. So free runs are also capped per network per day. The address is never stored:
 * only a salted hash of it and the UTC day, which changes daily. IPv6 counts per /64, the block one connection
 * gets, so rotating addresses inside it does not help. Google accounts are exempt (costly to mint in bulk and a
 * way out for people on a shared network); customers who have paid are never limited.
 */
import { createHash } from "node:crypto";
import { FreeRuns, Purchases, Users } from "@/db/repo";

export const FREE_RUNS_PER_NETWORK_PER_DAY = Math.max(1, Number(process.env.SEAM_FREE_RUNS_PER_NETWORK ?? 2) || 2);

export function networkOf(ip: string): string {
  const v = ip.trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
  if (!v.includes(":")) return v;
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const full = v.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export function networkKey(ip: string, day = new Date().toISOString().slice(0, 10)): string {
  const salt = process.env.SEAM_IP_SALT || "clipmelt-free-runs";
  return createHash("sha256").update(`${salt}|${day}|${networkOf(ip)}`).digest("hex").slice(0, 32);
}

/** The network key to charge this run against, or null when it is not a free run (paid or Google account). */
export function freeRunKey(userId: string, ip: string | undefined): string | null {
  if (!ip || ip === "local") return null;
  if (Users.get(userId)?.googleSub) return null;
  if (Purchases.forUser(userId).length > 0) return null;
  return networkKey(ip);
}

export const networkLimitReached = (key: string) => FreeRuns.count(key) >= FREE_RUNS_PER_NETWORK_PER_DAY;
