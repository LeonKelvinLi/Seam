"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Me { user: { id: string; email: string | null; credits: number; plan: string; createdAt: string } | null; purchases: { id: string; pack: string; credits: number; amountCents: number; currency: string; createdAt: string }[] }

export function Account() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/api/auth/me").then((m) => { if (!m.user) router.replace("/login?next=/account"); else setMe(m); }).catch(() => {}); }, [router]);
  if (!me?.user) return null;
  const logout = async () => { await api("/api/auth/logout", { method: "POST", json: {} }); window.dispatchEvent(new Event("clipmelt:account-updated")); router.push("/"); router.refresh(); };
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-12">
      {params.get("paid") && <div className="mb-6 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,106,61,0.12)", border: "1px solid rgba(255,106,61,0.3)" }}>Payment received. Credits land as soon as Stripe confirms, usually within seconds.</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-3xl">{me.user.email}</h1><p className="mt-1 muted text-sm">Plan: {me.user.plan}</p></div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="hair rounded-2xl p-6"><div className="mono muted uppercase">Credits</div><div className="mt-2 display text-5xl">{me.user.credits}</div><Link href="/pricing" className="btn btn-primary btn-sm mt-5">Add credits</Link></div>
        <div className="hair rounded-2xl p-6"><div className="mono muted uppercase">Purchases</div>
          {me.purchases.length === 0 ? <p className="mt-2 muted text-sm">No purchases yet.</p> : (
            <ul className="mt-2 space-y-2 text-sm">{me.purchases.map((p) => <li key={p.id} className="flex justify-between"><span>{p.pack} · {p.credits} credits</span><span className="muted">{(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}</span></li>)}</ul>
          )}
        </div>
      </div>
      <div className="mt-8"><Link href="/create" className="btn btn-ghost btn-sm">Back to your clips</Link></div>
    </div>
  );
}
