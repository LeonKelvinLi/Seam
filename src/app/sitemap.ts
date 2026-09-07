import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/server/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicOrigin();
  const now = new Date();
  return ["/", "/create", "/library", "/pricing", "/login", "/signup", "/terms", "/privacy", "/refunds"].map((p) => ({
    url: `${base}${p}`, lastModified: now, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : 0.6,
  }));
}
