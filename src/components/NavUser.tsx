"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

interface Me { user: { email: string | null; credits: number } | null }

export function NavUser() {
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname();
  const [here, setHere] = useState("/account");
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      void api<Me>("/api/auth/me", { signal: controller.signal, cache: "no-store" })
        .then(setMe).catch(() => { if (!controller.signal.aborted) setMe(null); });
    };
    setHere(["/", "/login", "/signup", "/forgot", "/reset"].includes(pathname)
      ? "/account" : pathname + window.location.search);
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("clipmelt:account-updated", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("clipmelt:account-updated", refresh);
    };
  }, [pathname]);
  if (!me?.user) return <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-ghost btn-sm nav-account">Log in</Link>;
  return <Link href="/account" className="btn btn-ghost btn-sm nav-account" aria-label={`Your account, ${me.user.credits} credits`}>
    <span>Account</span><span className="nav-credit-balance">{me.user.credits}<span className="nav-credit-label"> credits</span></span>
  </Link>;
}
