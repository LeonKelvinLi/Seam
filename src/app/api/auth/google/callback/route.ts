import { cookies } from "next/headers";
import { signIn } from "@/lib/server/auth";
import { GOOGLE_COOKIE, GOOGLE_COOKIE_PATH, accountForGoogle, decodeFlow, exchangeCode, googleConfigured, googleRedirectUri, sameState, siteUrl } from "@/lib/server/google";
import { LIMITS, clientIp, rateLimit } from "@/lib/server/ratelimit";
import { Events } from "@/db/repo";
import { logger } from "@/core/log";

const log = logger("auth");
const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });

/** Google sends the user back here with a one-time code; the flow cookie proves this browser started the sign-in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const flow = decodeFlow(jar.get(GOOGLE_COOKIE)?.value);
  jar.set(GOOGLE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: GOOGLE_COOKIE_PATH, maxAge: 0, secure: process.env.NODE_ENV === "production" });
  const fail = (code: string) => redirect(siteUrl(req, `/login?error=${code}${flow ? `&next=${encodeURIComponent(flow.next)}` : ""}`));
  if (!googleConfigured()) return fail("google_unavailable");
  if (url.searchParams.get("error")) return fail("google_denied");
  if (!rateLimit(`auth:${clientIp(req)}`, LIMITS.auth).ok) return fail("google_busy");
  const code = url.searchParams.get("code");
  if (!flow || !code || !sameState(url.searchParams.get("state") ?? "", flow.state)) return fail("google_expired");
  try {
    const identity = await exchangeCode(code, flow, googleRedirectUri(req));
    const { user, created } = accountForGoogle(identity);
    await signIn(user);
    Events.track(created ? "signup" : "login", { userId: user.id, props: { method: "google" } });
    return redirect(siteUrl(req, flow.next));
  } catch (e) {
    const reason = (e as Error).message;
    log.warn("google sign-in failed", { reason });
    return fail(reason === "unverified email" ? "google_unverified" : reason.startsWith("email linked") ? "google_conflict" : "google_failed");
  }
}
