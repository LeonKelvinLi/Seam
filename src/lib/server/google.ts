/**
 * Sign in with Google: OpenID Connect authorization-code flow with PKCE, state and nonce.
 * The ID token comes straight from Google's token endpoint over TLS, so its claims (issuer, audience, expiry, nonce,
 * verified email) are checked without fetching signing keys (OpenID Connect Core 3.1.3.7).
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, with <public origin>/api/auth/google/callback registered in Google Cloud.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Sessions, Users } from "@/db/repo";
import type { User } from "@/core/types";
import { safeNext } from "@/lib/safe-next";
import { publicOrigin } from "./site";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// Local end-to-end tests point the exchange at a stub; production always talks to Google.
const TOKEN_URL = (process.env.NODE_ENV !== "production" && process.env.GOOGLE_TOKEN_URL_DEV) || "https://oauth2.googleapis.com/token";
export const GOOGLE_COOKIE = "seam_google";
export const GOOGLE_COOKIE_PATH = "/api/auth/google";
const env = (k: string) => (process.env[k] ?? "").trim();

export function googleConfigured(): boolean {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}

/** Absolute URL on this site: the public origin in production (the request URL is the proxy's), the request origin in dev. */
export function siteUrl(req: Request, path: string): string {
  const origin = process.env.NODE_ENV === "production" ? publicOrigin() : new URL(req.url).origin;
  return `${origin}${path}`;
}

export const googleRedirectUri = (req: Request) => siteUrl(req, "/api/auth/google/callback");

export interface GoogleFlow { state: string; verifier: string; nonce: string; next: string }

const b64url = (buf: Buffer) => buf.toString("base64url");

export function startGoogleFlow(next: string | null): { flow: GoogleFlow; challenge: string } {
  const flow = { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)), nonce: b64url(randomBytes(24)), next: safeNext(next) };
  return { flow, challenge: b64url(createHash("sha256").update(flow.verifier).digest()) };
}

export function googleAuthUrl(flow: GoogleFlow, challenge: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export const encodeFlow = (flow: GoogleFlow) => Buffer.from(JSON.stringify(flow)).toString("base64url");

export function decodeFlow(raw: string | undefined): GoogleFlow | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GoogleFlow;
    return typeof f.state === "string" && typeof f.verifier === "string" && typeof f.nonce === "string" ? { ...f, next: safeNext(f.next) } : null;
  } catch {
    return null;
  }
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export interface GoogleIdentity { sub: string; email: string }

/** Checks the claims of an ID token received directly from Google. Throws with a short reason. */
export function verifyIdTokenClaims(idToken: string, opts: { clientId: string; nonce: string; nowSec?: number }): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id token");
  let c: Record<string, unknown>;
  try { c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { throw new Error("malformed id token"); }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("wrong issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(opts.clientId) || (c.azp !== undefined && c.azp !== opts.clientId)) throw new Error("wrong audience");
  if (typeof c.exp !== "number" || c.exp < now - 60) throw new Error("expired");
  if (typeof c.nonce !== "string" || !sameState(c.nonce, opts.nonce)) throw new Error("nonce mismatch");
  if (typeof c.sub !== "string" || !c.sub) throw new Error("missing subject");
  if (typeof c.email !== "string" || !c.email.includes("@")) throw new Error("missing email");
  if (c.email_verified !== true && c.email_verified !== "true") throw new Error("unverified email");
  return { sub: c.sub, email: c.email.toLowerCase() };
}

export async function exchangeCode(code: string, flow: GoogleFlow, redirectUri: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri,
      grant_type: "authorization_code", code_verifier: flow.verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(`token exchange failed${body.error ? ` (${body.error})` : ""}`);
  return verifyIdTokenClaims(body.id_token, { clientId: env("GOOGLE_CLIENT_ID"), nonce: flow.nonce });
}

/**
 * The account for a Google identity: the one already linked to it, else the account with the same email (linked now),
 * else a new account. An existing account whose email was never confirmed loses its password and sessions when it is
 * linked: whoever set them never proved they own the address, and Google just did.
 */
export function accountForGoogle(id: GoogleIdentity): { user: User; created: boolean } {
  const linked = Users.byGoogleSub(id.sub);
  if (linked) return { user: linked, created: false };
  const existing = Users.byEmail(id.email);
  if (!existing) return { user: Users.createGoogleAccount(id.email, id.sub), created: true };
  if (existing.googleSub) throw new Error("email linked to another Google account");
  const confirmed = !!existing.emailVerifiedAt;
  if (!confirmed) Sessions.destroyForUser(existing.id);
  Users.update(existing.id, { googleSub: id.sub, emailVerifiedAt: existing.emailVerifiedAt ?? new Date().toISOString(), passwordHash: confirmed ? existing.passwordHash : null });
  return { user: Users.get(existing.id)!, created: false };
}
