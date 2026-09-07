import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp"],
  poweredByHeader: false,
  // Large uploads go through route handlers (no body size cap there); this is for server actions only.
  experimental: { serverActions: { bodySizeLimit: "500mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Demo media and brand assets are content-addressed by deploy; cache for a day, revalidate in the background.
      { source: "/:dir(brand|examples|library|samples)/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
