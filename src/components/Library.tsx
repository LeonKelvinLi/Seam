"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, track } from "@/lib/api";

interface Recipe { id: string; name: string; category: string; tags: string[]; description: string; intensity: number; wow: number; recommendedDuration: [number, number]; local: { kind: string; xfade: string }; previewUrl: string | null; sound?: string }
interface Category { tag: string; label: string; emoji: string }

export function Library() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get("p");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [tag, setTag] = useState<string>("viral");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ categories: Category[]; recipes: Recipe[] }>("/api/recipes").then((r) => { setCats(r.categories); setRecipes(r.recipes); }).catch(() => {});
    track("library_view", { projectId });
  }, [projectId]);

  const list = useMemo(() => recipes.filter((r) => r.tags.includes(tag)), [recipes, tag]);

  const use = async (r: Recipe) => {
    if (!projectId) { router.push(`/create?recipe=${r.id}`); return; }
    setBusy(r.id); setError(null);
    try {
      const res = await api<{ generation: { id: string } }>(`/api/projects/${projectId}/generate`, { method: "POST", json: { recipeId: r.id } });
      router.push(`/create?p=${projectId}&g=${res.generation.id}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl md:text-4xl">Transitions</h1>
        {projectId ? <Link href={`/create?p=${projectId}`} className="btn btn-ghost btn-sm">Back to your clips</Link> : <span className="muted text-sm">Pick one, then bring your clips.</span>}
      </div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {cats.map((c) => <button key={c.tag} className="chip" data-on={c.tag === tag} onClick={() => setTag(c.tag)}>{c.emoji} {c.label}</button>)}
      </div>
      {error && <div className="mt-4 text-sm" style={{ color: "var(--accent)" }}>{error}</div>}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => <RecipeCard key={r.id} recipe={r} busy={busy === r.id} onUse={() => use(r)} cta={projectId ? "Use on my clips" : "Try with my clips"} />)}
      </div>
    </div>
  );
}

function RecipeCard({ recipe, onUse, busy, cta }: { recipe: Recipe; onUse: () => void; busy: boolean; cta: string }) {
  const v = useRef<HTMLVideoElement | null>(null);
  return (
    <div className="group">
      <div className="frame grain aspect-video" onMouseEnter={() => v.current?.play().catch(() => {})} onMouseLeave={() => { if (v.current) { v.current.pause(); v.current.currentTime = 0; } }}>
        {recipe.previewUrl ? (
          <video ref={v} src={recipe.previewUrl} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: "linear-gradient(135deg,#1a1a1d,#0c0c0e)" }}>
            <span className="transition-transform duration-500 group-hover:scale-125">{GLYPH[recipe.local.kind] ?? "→"}</span>
          </div>
        )}
        <div className="absolute left-3 top-3 mono uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>{recipe.category}</div>
        <div className="absolute right-3 top-3 mono" style={{ color: "rgba(255,255,255,0.5)" }}>{Math.round(recipe.intensity * 100)}</div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg leading-tight">{recipe.name}</div>
          <div className="mt-1 muted text-sm">{recipe.description}</div>
        </div>
        <button className="btn btn-ghost btn-sm shrink-0" onClick={onUse} disabled={busy}>{busy ? "…" : cta}</button>
      </div>
    </div>
  );
}

const GLYPH: Record<string, string> = { "zoom-in": "⤢", "zoom-out": "⤡", "whip-left": "←", "whip-right": "→", "whip-up": "↑", "whip-down": "↓", dissolve: "◐", flash: "✦", spin: "↻", circle: "◎", blur: "≈", squeeze: "▮", radial: "✺", pixel: "▦" };
