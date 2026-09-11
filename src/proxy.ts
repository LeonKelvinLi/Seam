import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { crossSiteRequest } from "@/lib/server/csrf";

/** Refuse cookie-bearing state changes that originate from another site. Stripe posts with no Origin and is exempt. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/stripe/webhook")) return NextResponse.next();
  if (crossSiteRequest(request.method, request.headers, request.headers.get("host"))) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  return NextResponse.next();
}

// Every API route except the upload. Next buffers each request body that passes through the proxy and cuts it at
// 10 MB (proxyClientMaxBodySize), so clips over 10 MB reached the upload route truncated and failed to parse as form
// data. The upload route runs the same cross-site check itself.
export const config = { matcher: ["/api/((?!upload$).*)"] };
