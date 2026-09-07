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

export const config = { matcher: "/api/:path*" };
