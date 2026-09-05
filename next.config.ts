import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp"],
  // Large uploads go through route handlers (no body size cap there); this is for server actions only.
  experimental: { serverActions: { bodySizeLimit: "500mb" } },
};

export default nextConfig;
