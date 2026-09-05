"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenerationView, ProjectView } from "@/lib/server/views";
import { DEFAULT_FINE_TUNE, type FineTune } from "@/core/types";
import { api, track, uploadFile } from "@/lib/api";
import { DropZone } from "./DropZone";
import { Steps } from "./Steps";
import { LaneCard } from "./LaneCard";
import { FineTunePanel } from "./FineTune";
import { ANALYZE_STEPS, GENERATE_STEPS } from "@/core/pipeline/stages";

type Phase = "upload" | "analyzing" | "choose" | "generating" | "ready" | "failed";
interface Sample { id: string; title: string; aPoster: string; bPoster: string }

export function CreateFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<ProjectView | null>(null);
  const [gen, setGen] = useState<GenerationView | null>(null);
  const [up, setUp] = useState<Record<"start" | "end", { uploading: boolean; progress: number }>>({ start: { uploading: false, progress: 0 }, end: { uploading: false, progress: 0 } });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [fineTune, setFineTune] = useState<FineTune>(DEFAULT_FINE_TUNE);
  const [showFineTune, setShowFineTune] = useState(false);
  const [videoMode, setVideoMode] = useState<"full" | "bridge">("full");
  const [copied, setCopied] = useState(false);
  const autoRecipe = useRef<string | null>(params.get("recipe"));
  const analyzeRequested = useRef<string | null>(null);

  const projectId = view?.project.id ?? null;

  const phase: Phase = useMemo(() => {
    if (gen) {
      if (gen.status === "ready") return "ready";
      if (gen.status === "failed") return "failed";
      return "generating";
    }
    if (!view) return "upload";
    if (view.analysis.status === "running" || view.project.status === "analyzing") return "analyzing";
    if (view.project.status === "analyzed" && view.recommendations.length) return "choose";
    return "upload";
  }, [view, gen]);

  const setUrl = useCallback((p: string | null, g: string | null) => {
    const q = new URLSearchParams();
    if (p) q.set("p", p);
    if (g) q.set("g", g);
    router.replace(`/create${q.toString() ? `?${q}` : ""}`);
  }, [router]);

  // Boot: resume from URL, load samples.
  useEffect(() => {
    const p = params.get("p"), g = params.get("g");
    if (p) api<ProjectView>(`/api/projects/${p}`).then((v) => { setView(v); if (g) setGen(v.generations.find((x) => x.id === g) ?? null); }).catch(() => {});
    api<{ samples: Sample[] }>("/api/samples").then((r) => setSamples(r.samples)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-analyze when both clips are present.
  useEffect(() => {
    if (!view || !projectId) return;
    const ready = view.assets.start && view.assets.end;
    if (ready && view.project.status === "draft" && analyzeRequested.current !== projectId + view.assets.start!.id + view.assets.end!.id) {
      analyzeRequested.current = projectId + view.assets.start!.id + view.assets.end!.id;
      api<{ state: ProjectView }>(`/api/projects/${projectId}/analyze`, { method: "POST", json: {} }).then((r) => setView(r.state)).catch((e) => setError(e.message));
    }
  }, [view, projectId]);

  // Poll analysis.
  useEffect(() => {
    if (phase !== "analyzing" || !projectId) return;
    const t = setInterval(() => api<ProjectView>(`/api/projects/${projectId}`).then(setView).catch(() => {}), 1200);
    return () => clearInterval(t);
  }, [phase, projectId]);

  // Poll generation.
  useEffect(() => {
    if (phase !== "generating" || !gen) return;
    const t = setInterval(() => api<{ generation: GenerationView }>(`/api/generations/${gen.id}`).then((r) => {
      setGen(r.generation);
      if (r.generation.status === "ready" || r.generation.status === "failed") api<ProjectView>(`/api/projects/${r.generation.projectId}`).then(setView).catch(() => {});
    }).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [phase, gen]);

  const generate = useCallback(async (body: Record<string, unknown>) => {
    if (!projectId) return;
    setBusy(true); setError(null); setShowFineTune(false); setVideoMode("full");
    try {
      const r = await api<{ generation: GenerationView }>(`/api/projects/${projectId}/generate`, { method: "POST", json: body });
      setGen(r.generation);
      setFineTune(r.generation.fineTune);
      setUrl(projectId, r.generation.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [projectId, setUrl]);

  // Library pick (?recipe=) fires once analysis is done.
  useEffect(() => {
    if (phase === "choose" && autoRecipe.current) { const r = autoRecipe.current; autoRecipe.current = null; void generate({ recipeId: r }); }
  }, [phase, generate]);

  const onFile = async (role: "start" | "end", file: File) => {
    setError(null);
    setUp((u) => ({ ...u, [role]: { uploading: true, progress: 0 } }));
    track("upload_started", { role, type: file.type, bytes: file.size }, { projectId: projectId ?? undefined });
    try {
      const r = (await uploadFile(file, role, projectId, (p) => setUp((u) => ({ ...u, [role]: { uploading: true, progress: p } })))) as { state: ProjectView };
      setView(r.state); setGen(null); setUrl(r.state.project.id, null);
    } catch (e) { setError((e as Error).message); } finally { setUp((u) => ({ ...u, [role]: { uploading: false, progress: 0 } })); }
  };

  const useSample = async (id: string) => {
    setError(null); setBusy(true);
    try { const v = await api<ProjectView>("/api/samples", { method: "POST", json: { pairId: id } }); setView(v); setGen(null); setUrl(v.project.id, null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const feedback = (action: string) => gen && void api(`/api/generations/${gen.id}/feedback`, { method: "POST", json: { action } }).catch(() => {});
  const download = (kind: "full" | "bridge") => {
    if (!gen?.result) return;
    const url = kind === "full" ? gen.result.fullUrl : gen.result.bridgeUrl;
    if (!url) return;
    feedback(kind === "full" ? "download_full" : "download_bridge");
    const a = document.createElement("a"); a.href = `${url}?download=seam-${kind}-${gen.id}.mp4`; a.download = `seam-${kind}.mp4`; a.click();
  };
  const share = async () => {
    if (!gen) return;
    try {
      const r = await api<{ url: string }>("/api/share", { method: "POST", json: { generationId: gen.id } });
      await navigator.clipboard.writeText(r.url).catch(() => {});
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };
  const reset = () => { setView(null); setGen(null); setError(null); analyzeRequested.current = null; setUrl(null, null); };

  const frames = { a: view?.boundary?.startFrameUrl ?? view?.assets.start?.thumbnailUrl ?? null, b: view?.boundary?.endFrameUrl ?? view?.assets.end?.thumbnailUrl ?? null };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8">
      {/* ---------------------------------------------------------------- upload / analyzing */}
      {(phase === "upload" || phase === "analyzing") && (
        <div className="rise">
          <div className="grid gap-4 md:grid-cols-2">
            <DropZone role="start" asset={view?.assets.start ?? null} uploading={up.start.uploading} progress={up.start.progress} onFile={(f) => onFile("start", f)} disabled={phase === "analyzing"} />
            <DropZone role="end" asset={view?.assets.end ?? null} uploading={up.end.uploading} progress={up.end.progress} onFile={(f) => onFile("end", f)} disabled={phase === "analyzing"} />
          </div>
          {phase === "analyzing" ? (
            <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
              <Steps steps={ANALYZE_STEPS} current={view?.analysis.stageLabel || ANALYZE_STEPS[0]} />
              <p className="muted text-sm">We look at the last moments of your first clip and the first moments of your second, and design a cut that fits what is actually in the frame.</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="muted text-sm">{view?.assets.start || view?.assets.end ? "Add the other clip to continue." : "Any two clips or images. Video → video, image → video, video → image, image → image."}</span>
              {samples.length > 0 && !view?.assets.start && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="muted text-sm">Or try:</span>
                  {samples.map((s) => <button key={s.id} className="chip" onClick={() => useSample(s.id)} disabled={busy}>{s.title}</button>)}
                </div>
              )}
            </div>
          )}
          {view?.project.status === "failed" && <Notice>{view.project.analysisError ? "We couldn't read those clips. Try a different export (MP4, H.264) or another pair." : "Something went wrong."} <button className="underline" onClick={reset}>Start over</button></Notice>}
        </div>
      )}

      {/* ---------------------------------------------------------------- choose */}
      {phase === "choose" && view && (
        <div className="rise">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="display text-3xl md:text-4xl">Recommended for your clips</h1>
              {view.boundary?.narrative ? <p className="mt-2 muted max-w-2xl">{view.boundary.narrative}</p> : null}
            </div>
            <div className="flex gap-2">
              <Link href={`/library?p=${view.project.id}`} className="btn btn-ghost btn-sm">Browse all transitions</Link>
              <button className="btn btn-ghost btn-sm" onClick={reset}>Change clips</button>
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {view.recommendations.filter((r) => r && r.lane !== "surprise").map((r) => r && (
              <LaneCard key={r.lane} lane={r.lane} label={r.label} blurb={r.blurb} opportunity={r.opportunity} frames={frames} busy={busy} onPick={() => generate({ intent: r.lane, opportunityId: r.opportunity.id })} />
            ))}
          </div>
          {(() => { const s = view.recommendations.find((r) => r && r.lane === "surprise"); return s ? (
            <div className="mt-8 flex flex-wrap items-center gap-4 hair rounded-2xl p-5">
              <button className="btn btn-accent" onClick={() => generate({ intent: "surprise", opportunityId: s.opportunity.id })} disabled={busy}>Surprise me</button>
              <div className="text-sm"><span>{s.opportunity.title}.</span> <span className="muted">{s.opportunity.why}</span></div>
            </div>
          ) : null; })()}
          {view.runtime.providers.length === 1 && <p className="mt-5 text-xs muted">Preview mode: no video model key is configured, so bridges are rendered procedurally. Add FAL_KEY or RUNWAYML_API_SECRET for generated camera moves.</p>}
        </div>
      )}

      {/* ---------------------------------------------------------------- generating */}
      {phase === "generating" && gen && (
        <div className="rise grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div className="frame grain aspect-video">
            <div className="absolute inset-0 grid grid-cols-2">
              {frames.a ? <img src={frames.a} alt="" className="h-full w-full object-cover" /> : <div />}
              {frames.b ? <img src={frames.b} alt="" className="h-full w-full object-cover" /> : <div />}
            </div>
            <div className="pulse absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--fg)" }} />
            <div className="absolute bottom-3 left-3 text-sm" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{gen.title}</div>
          </div>
          <div>
            <Steps steps={GENERATE_STEPS} current={gen.stageLabel} />
            <p className="mt-6 muted text-sm">{gen.stage === "retry" ? gen.stageLabel : "Usually under a minute for a preview. Real camera moves from a video model take a few minutes."}</p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- ready */}
      {phase === "ready" && gen?.result && (
        <div className="rise">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="display text-3xl md:text-4xl">Your transition is ready</h1>
            <div className="seg">
              <button data-on={videoMode === "full"} onClick={() => setVideoMode("full")}>Full edit</button>
              <button data-on={videoMode === "bridge"} onClick={() => setVideoMode("bridge")}>Transition only</button>
            </div>
          </div>
          <div className="frame grain mt-5 aspect-video bg-black">
            <video key={videoMode + gen.id} src={(videoMode === "full" ? gen.result.fullUrl : gen.result.bridgeUrl) ?? undefined} poster={gen.result.posterUrl ?? undefined} controls autoPlay playsInline loop={videoMode === "bridge"} className="h-full w-full object-contain" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div><span>{gen.title}</span> <span className="muted">· {gen.recipe.name} · {gen.result.bridgeDurationSec.toFixed(1)}s bridge</span></div>
            <div className="muted text-xs">{gen.result.isPreviewTier ? "Preview quality" : gen.result.modelLabel}{gen.result.attempts > 1 ? ` · ${gen.result.attempts} attempts` : ""}</div>
          </div>
          <div className="mt-1 text-xs muted">Sound: {gen.sound}{gen.motivatedBy ? ` · Motivated by ${gen.motivatedBy}` : ""}</div>
          {gen.result.suggestion && <Notice>{gen.result.suggestion}</Notice>}
          {gen.result.fellBackToLocal && !gen.result.suggestion && <Notice>The video model didn't produce a clean take, so this is a procedural preview of the move.</Notice>}

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => download("full")}>Download full edit</button>
            <button className="btn btn-ghost" onClick={() => download("bridge")}>Download transition only</button>
            <span className="mx-1 hidden md:inline-block w-px self-stretch" style={{ background: "var(--hair)" }} />
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "another" } })} disabled={busy}>Try another</button>
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "wilder" } })} disabled={busy}>Make wilder</button>
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "smoother" } })} disabled={busy}>Make smoother</button>
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "regenerate" } })} disabled={busy}>Regenerate</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost btn-sm" onClick={share}>{copied ? "Link copied" : "Share"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFineTune((v) => !v)}>Fine tune</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Create another</button>
            <Link href={`/library?p=${gen.projectId}`} className="btn btn-ghost btn-sm">Pick from library</Link>
          </div>
          {showFineTune && <div className="mt-5"><FineTunePanel value={fineTune} onChange={setFineTune} busy={busy} onApply={() => generate({ from: { generationId: gen.id, action: "regenerate" }, fineTune })} /></div>}

          {view && view.generations.length > 1 && (
            <div className="mt-10">
              <div className="mono muted uppercase">Earlier takes</div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {view.generations.filter((g) => g.status === "ready" && g.result).map((g) => (
                  <button key={g.id} onClick={() => { setGen(g); setUrl(g.projectId, g.id); }} className="frame shrink-0 w-44 aspect-video" style={{ outline: g.id === gen.id ? "1px solid rgba(255,255,255,0.6)" : "none" }}>
                    {g.result?.posterUrl ? <img src={g.result.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
                    <div className="absolute bottom-2 left-2 text-xs" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{g.recipe.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- failed */}
      {phase === "failed" && gen && (
        <div className="rise max-w-xl">
          <h1 className="display text-3xl">That one didn't come together</h1>
          <p className="mt-3 muted">{gen.friendlyError ?? "We couldn't build that transition."}</p>
          <div className="mt-6 flex gap-2">
            <button className="btn btn-primary" onClick={() => generate({ intent: "smooth" })} disabled={busy}>Try a safer transition</button>
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "another" } })} disabled={busy}>Try another idea</button>
            <button className="btn btn-ghost" onClick={reset}>Change clips</button>
          </div>
        </div>
      )}

      {error && <Notice>{error}</Notice>}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,106,61,0.12)", border: "1px solid rgba(255,106,61,0.3)" }}>{children}</div>;
}
