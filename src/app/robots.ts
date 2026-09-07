import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/server/site";

export default function robots(): MetadataRoute.Robots {
  const base = publicOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/ops", "/account", "/t/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
