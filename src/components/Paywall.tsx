"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Pack { id: string; name: string; credits: number; priceUsd: number; blurb: string }
interface Me { user: { email: string | null; credits: number } | null; packs: Pack[]; billing: { checkout: boolean; links: string[] } }

/** Shown in the studio when the free runs are used up: buy inline, or create an account first as a guest. */
export function Paywall({ freeRuns }: { freeRuns: number }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Me>("/api/auth/me").then(setMe).catch(() => {}); }, []);
  const guest = !me?.user?.email;
  const buy = async (pack: Pack) => {
    if (guest) { router.push(`/signup?next=${encodeURIComponent("/pricing")}`); return; }
    setBusy(pack.id); setError(null);
    try { const r = await api<{ url: string }>("/api/stripe/checkout", { method: "POST", json: { pack: pack.id } }); window.location.href = r.url; }
    catch (e) { setError((e as Error).message); setBusy(null); }
  };
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6" aria-live="polite">
      <p className="mono text-xs muted">Free trial used</p>
      <h2 className="display text-2xl mt-1">Your {freeRuns} free runs are done.</h2>
      <p className="mt-2 muted text-sm">{guest ? "Create an account to keep this project and buy credits. Two credits per preview transition." : "Add a credit pack to keep generating. Credits never expire."}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {(me?.packs ?? []).map((p) => (
          <button key={p.id} type="button" disabled={busy !== null} onClick={() => buy(p)} className="rounded-xl border border-white/10 p-4 text-left hover:border-white/30 disabled:opacity-60">
            <span className="mono text-[10px] muted">{p.name.toUpperCase()}</span>
            <span className="block text-2xl font-semibold">${p.priceUsd}</span>
            <span className="block text-sm muted">{p.credits} credits</span>
            <span className="mt-3 block text-sm underline">{guest ? "Create account" : busy === p.id ? "Opening checkout…" : `Get ${p.name}`}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <p className="mt-4 text-xs muted"><Link href="/pricing" className="underline">Compare packs</Link>{guest && <> · <Link href="/login" className="underline">Already have an account? Sign in</Link></>}</p>
    </section>
  );
}
