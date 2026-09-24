"use client";
import { useEffect } from "react";
import { track } from "@/lib/api";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"] as const;

/**
 * Reports a visit once per browser, and again whenever a link carries campaign or referral tags, with where it came
 * from (tags, referrer host, landing path, device class). Also records clicks on elements marked data-cta.
 */
export function Attribution() {
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tagged = KEYS.some((k) => params.get(k));
    let seen = false;
    try { seen = localStorage.getItem("cm_seen") === "1"; localStorage.setItem("cm_seen", "1"); } catch { /* private mode */ }
    if (!seen || tagged) {
      const props: Record<string, string | boolean> = { path: location.pathname, returning: seen, device: matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop" };
      for (const k of KEYS) { const v = params.get(k); if (v) props[k] = v; }
      try { if (document.referrer) { const r = new URL(document.referrer); if (r.host !== location.host) props.referrer = r.host; } } catch { /* opaque referrer */ }
      track("visit", props);
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cta]");
      if (el) track("cta_click", { cta: el.dataset.cta ?? "", path: location.pathname });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
