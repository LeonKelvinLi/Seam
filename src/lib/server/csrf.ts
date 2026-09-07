/**
 * Cross-site request guard for cookie-authenticated JSON/form routes. Browsers send Sec-Fetch-Site and
 * Origin on state-changing requests; a request from another site is refused before it reaches a handler.
 * Non-browser clients (curl, Stripe) send neither header and pass; they cannot carry a user's cookies.
 */
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSiteRequest(method: string, headers: Headers, host: string | null): boolean {
  if (SAFE.has(method.toUpperCase())) return false;
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site" && site !== "none") return true;
  const origin = headers.get("origin");
  if (origin && host) {
    try { return new URL(origin).host !== host; } catch { return true; }
  }
  return false;
}
