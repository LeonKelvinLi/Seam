"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { GoogleButton } from "@/components/GoogleButton";

interface Pack { id: string; name: string; credits: number; priceUsd: number; blurb: string }
interface Me { user: { email: string | null; credits: number } | null; packs: Pack[]; billing: { checkout: boolean; links: string[]; webhook: boolean } }

export function Pricing() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Me>("/api/auth/me").then(setMe).catch(() => {}); }, []);
  const buy = async (pack: Pack) => {
    if (!me?.user) { router.push(`/signup?next=${encodeURIComponent("/pricing")}`); return; }
    setBusy(pack.id); setError(null);
    try { const r = await api<{ url: string }>("/api/stripe/checkout", { method: "POST", json: { pack: pack.id } }); window.location.href = r.url; }
    catch (e) { setError((e as Error).message); setBusy(null); }
  };
  const configured = me ? me.billing.checkout || me.billing.links.length > 0 : true;
  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <h1 className="display text-4xl">Credits, not subscriptions.</h1>
      <p className="mt-3 muted max-w-xl">A preview transition costs 2 credits and a final-quality render 6. Credits never expire.</p>
      {me && !me.user && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <span className="muted">Sign in to buy:</span>
          <GoogleButton next="/pricing" />
          <Link href="/signup?next=%2Fpricing" className="underline">or use email</Link>
        </div>
      )}
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {(me?.packs ?? []).map((p) => (
          <div key={p.id} className="hair rounded-2xl p-6 flex flex-col">
            <div className="mono muted uppercase">{p.name}</div>
            <div className="mt-3 display text-4xl">${p.priceUsd}</div>
            <div className="mt-1 text-sm">{p.credits} credits</div>
            <p className="mt-3 muted text-sm flex-1">{p.blurb}</p>
            <button className="btn btn-primary mt-6" onClick={() => buy(p)} disabled={busy === p.id || !configured}>{busy === p.id ? "…" : `Get ${p.name}`}</button>
          </div>
        ))}
      </div>
      {!configured && <p className="mt-6 text-sm muted">Payments are not connected yet. Add your Stripe keys to <span className="mono">.env.local</span> to turn these buttons on.</p>}
      {error && <p className="mt-4 text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
    </div>
  );
}
