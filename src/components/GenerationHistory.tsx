"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { HistoryPage } from "@/lib/server/history";
import { StudioTabs } from "./StudioTabs";

export function GenerationHistory() {
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const failedCursor = useRef<string | null>(null);
  const load = useCallback(async (cursor: string | null = null) => {
    if (loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setError(null); failedCursor.current = cursor;
    try {
      const next = await api<HistoryPage>(`/api/generations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
      setPage((previous) => cursor && previous ? { ...next, generations: [...previous.generations, ...next.generations.filter((g) => !previous.generations.some((old) => old.id === g.id))] } : next);
    } catch { setError("We couldn’t load your previous generations. Please try again."); }
    finally { setLoading(false); loadingRef.current = false; }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="studio-shell mx-auto max-w-6xl px-5 pb-20">
    <StudioTabs active="history" />
    <div className="history-heading">
      <div><h1 className="display text-4xl sm:text-5xl">Previous generations</h1><p className="mt-3 muted">Your finished transitions, ready to watch and use again.</p></div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void load()}>Refresh</button>
        <Link href="/create" className="btn btn-primary">Create transition <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
    {page?.isGuest && <p className="mb-7 text-sm muted">Showing footage from this browser. <Link href="/signup" className="text-[var(--accent)] underline underline-offset-4">Create an account</Link> to keep it with you.</p>}
    {error && <div role="alert" className="mb-6 rounded-lg border border-[var(--hair)] p-4"><p>{error}</p><button className="btn btn-ghost btn-sm mt-3" onClick={() => void load(failedCursor.current)} disabled={loading}>Try again</button></div>}
    {loading && !page && <p role="status" className="py-16 muted">Loading your footage…</p>}
    {page && page.generations.length === 0 && !loading && !error && <div className="history-empty">
      <span aria-hidden="true" className="text-4xl text-[var(--accent)]">↗</span>
      <h2 className="mt-4 text-2xl">Your next great cut starts here.</h2>
      <p className="mt-3 muted">Once a transition is finished, it will appear here.</p>
      <Link href="/create" className="btn btn-primary mt-7">Make a transition</Link>
    </div>}
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy={loading}>
      {page?.generations.map((g) => <article key={g.id} className="history-card">
        <video controls playsInline preload="none" poster={g.posterUrl ?? undefined} src={g.fullUrl ?? g.bridgeUrl ?? undefined}
          aria-label={`${g.title} video preview`} className="aspect-video w-full bg-black object-contain" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-medium">{g.title}</h2><span className="shrink-0 text-xs text-[var(--accent)]">{g.fullDurationSec.toFixed(1)}s</span></div>
          <p className="mt-2 text-xs muted"><time dateTime={g.createdAt}>{new Date(g.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p>
          <div className="mt-5 flex flex-wrap gap-2">
            {([['transition', 'Transition only', g.bridgeUrl], ['full-video', 'Full video', g.fullUrl]] as const).map(([kind, label, url]) => url &&
              <a key={kind} className="btn btn-ghost btn-sm" download={`clipmelt-${kind}-${g.id}.mp4`} href={`${url}?download=clipmelt-${kind}-${g.id}.mp4`} aria-label={`Download ${label.toLowerCase()} — ${g.title}`}>{label} ↓</a>)}
          </div>
          <Link className="mt-4 inline-flex min-h-11 items-center text-sm text-[var(--accent)]" href={`/create?p=${encodeURIComponent(g.projectId)}&g=${encodeURIComponent(g.id)}`}>Open in studio ↗</Link>
        </div>
      </article>)}
    </div>
    {page?.nextCursor && <div className="mt-8 text-center"><button className="btn btn-ghost" disabled={loading} onClick={() => void load(page.nextCursor)}>{loading ? "Loading…" : "Load more"}</button></div>}
  </div>;
}
