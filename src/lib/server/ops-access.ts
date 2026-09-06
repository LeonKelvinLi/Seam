import { timingSafeEqual } from "node:crypto";

/** Development keeps local diagnostics; production is closed unless a server-only token matches. */
export function opsAccessAllowed(
  authorization: string | null,
  env: { NODE_ENV?: string; SEAM_OPS_TOKEN?: string } = process.env,
): boolean {
  if (env.NODE_ENV !== "production") return true;
  const expected = (env.SEAM_OPS_TOKEN ?? "").trim();
  const supplied = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
