import { cookies } from "next/headers";
import { GOOGLE_COOKIE, GOOGLE_COOKIE_PATH, encodeFlow, googleAuthUrl, googleConfigured, googleRedirectUri, siteUrl, startGoogleFlow } from "@/lib/server/google";
import { LIMITS, clientIp, rateLimit } from "@/lib/server/ratelimit";

const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });

/** "Continue with Google": keep state, PKCE verifier and nonce in a short-lived cookie, then hand off to Google. */
export async function GET(req: Request) {
  if (!googleConfigured()) return redirect(siteUrl(req, "/login?error=google_unavailable"));
  if (!rateLimit(`auth:${clientIp(req)}`, LIMITS.auth).ok) return redirect(siteUrl(req, "/login?error=google_busy"));
  const { flow, challenge } = startGoogleFlow(new URL(req.url).searchParams.get("next"));
  (await cookies()).set(GOOGLE_COOKIE, encodeFlow(flow), {
    httpOnly: true, sameSite: "lax", path: GOOGLE_COOKIE_PATH, maxAge: 600, secure: process.env.NODE_ENV === "production",
  });
  return redirect(googleAuthUrl(flow, challenge, googleRedirectUri(req)));
}
