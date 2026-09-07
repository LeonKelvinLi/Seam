/**
 * In-process sliding-window rate limiter. The app runs as a single instance with a disk, so an
 * in-memory map is the right tool; it protects auth, upload and generation routes from abuse.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 50_000;

export interface Limit { max: number; windowMs: number }

export const LIMITS = {
  auth: { max: 10, windowMs: 10 * 60_000 },        // sign-up / login attempts per IP
  upload: { max: 40, windowMs: 60 * 60_000 },      // uploads per user per hour
  generate: { max: 30, windowMs: 60 * 60_000 },    // generations per user per hour
  api: { max: 600, windowMs: 60_000 },             // generic burst guard per IP
} as const satisfies Record<string, Limit>;

export function rateLimit(key: string, limit: Limit, now = Date.now()): { ok: boolean; retryAfterSec: number; remaining: number } {
  const since = now - limit.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= limit.max) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + limit.windowMs - now) / 1000)), remaining: 0 };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) sweep(now);
  return { ok: true, retryAfterSec: 0, remaining: limit.max - hits.length };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export function tooMany(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Try again in a moment." }), {
    status: 429, headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}

function sweep(now: number) {
  for (const [k, hits] of buckets) { if (!hits.length || hits[hits.length - 1] < now - 60 * 60_000) buckets.delete(k); }
}

export function _resetForTests() { buckets.clear(); }
