"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenerationView, ProjectView } from "@/lib/server/views";
import { DEFAULT_FINE_TUNE, type FineTune } from "@/core/types";
import { api, track, uploadFile } from "@/lib/api";
import { Paywall } from "@/components/Paywall";
import { DownloadOptions } from "@/components/DownloadOptions";
import { createProjectUploadQueue } from "@/lib/project-uploads";
import { studioUrl } from "@/lib/studio-url";
import { DropZone } from "./DropZone";
import { Steps } from "./Steps";
import { StudioTabs } from "./StudioTabs";
import { LaneCard } from "./LaneCard";
import { FineTunePanel } from "./FineTune";
import { ANALYZE_STEPS, GENERATE_STEPS } from "@/core/pipeline/stages";

type Phase = "upload" | "analyzing" | "choose" | "generating" | "ready" | "failed";
interface Sample { id: string; title: string; aPoster: string; bPoster: string }

export function CreateFlow({ styles }: { styles: { id: string; name: string; needs: string }[] }) {
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
  const [needCredits, setNeedCredits] = useState(false);
  const autoRecipe = useRef<string | null>(params.get("recipe"));
  const [selectedRecipeId, setSelectedRecipeId] = useState(params.get("recipe"));
  const selectedStyle = styles.find((r) => r.id === selectedRecipeId);
  const analyzeRequested = useRef<string | null>(null);
  const uploadQueue = useRef(createProjectUploadQueue<{ state: ProjectView }>(params.get("p")));
  const loadingSample = useRef(false);

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
    router.replace(studioUrl(p, g, autoRecipe.current));
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
    if (!view || !projectId || up.start.uploading || up.end.uploading || uploadQueue.current.pending) return;
    const ready = view.assets.start && view.assets.end;
    if (ready && view.project.status === "draft" && analyzeRequested.current !== projectId + view.assets.start!.id + view.assets.end!.id) {
      analyzeRequested.current = projectId + view.assets.start!.id + view.assets.end!.id;
      api<{ state: ProjectView }>(`/api/projects/${projectId}/analyze`, { method: "POST", json: {} }).then((r) => setView(r.state)).catch((e) => setError(e.message));
    }
  }, [view, projectId, up.start.uploading, up.end.uploading]);

  // Poll analysis.
  useEffect(() => {
    if (phase !== "analyzing" || !projectId) return;
    const t = setInterval(() => api<ProjectView>(`/api/projects/${projectId}`).then(setView).catch(() => {}), 1200);
    return () => clearInterval(t);
  }, [phase, projectId]);

  // Poll generation.
  useEffect(() => {
    if (phase !== "generating" || !gen) return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
    const t = setInterval(() => api<{ generation: GenerationView }>(`/api/generations/${gen.id}`).then((r) => {
      if (r.generation.status === "ready" && gen.status !== "ready" && document.hidden && "Notification" in window && Notification.permission === "granted") {
        try { new Notification("Your transition is ready", { body: r.generation.title ?? "Open Clipmelt to watch it." }); } catch { /* notifications unavailable */ }
      }
      setGen(r.generation);
      if (r.generation.status === "ready" || r.generation.status === "failed") {
        window.dispatchEvent(new Event("clipmelt:account-updated"));
        api<ProjectView>(`/api/projects/${r.generation.projectId}`).then(setView).catch(() => {});
      }
    }).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [phase, gen]);

  // A clock that ticks while the bridge renders. The model works on its own schedule and a step can stay the same for
  // minutes, so the screen has to show something moving or the wait reads as a freeze.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const stageSince = useRef({ label: "", at: Date.now() });
  useEffect(() => {
    if (phase !== "generating") return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  if (gen && stageSince.current.label !== gen.stageLabel) stageSince.current = { label: gen.stageLabel, at: Date.now() };

  const generate = useCallback(async (body: Record<string, unknown>) => {
    if (!projectId) return;
    setBusy(true); setError(null); setShowFineTune(false); setVideoMode("full");
    try {
      const r = await api<{ generation: GenerationView }>(`/api/projects/${projectId}/generate`, { method: "POST", json: body });
      window.dispatchEvent(new Event("clipmelt:account-updated"));
      setGen(r.generation);
      setFineTune(r.generation.fineTune);
      setUrl(projectId, r.generation.id);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/out of credits/i.test(msg) ? "You're out of credits." : msg);
      if (/out of credits/i.test(msg)) setNeedCredits(true);
    } finally { setBusy(false); }
  }, [projectId, setUrl]);

  // Library pick (?recipe=) fires once analysis is done.
  useEffect(() => {
    if (phase === "choose" && autoRecipe.current) {
      const r = autoRecipe.current;
      autoRecipe.current = null;
      setSelectedRecipeId(null);
      setUrl(projectId, null);
      void generate({ recipeId: r });
    }
  }, [phase, generate, projectId, setUrl]);

  const onFile = async (role: "start" | "end", file: File) => {
    if (loadingSample.current) return;
    const queue = uploadQueue.current;
    setError(null);
    setUp((u) => ({ ...u, [role]: { uploading: true, progress: 0 } }));
    track("upload_started", { role, type: file.type, bytes: file.size }, { projectId: projectId ?? undefined });
    try {
      const r = await queue.run((id) => uploadFile(file, role, id, (p) => {
        if (queue === uploadQueue.current) setUp((u) => ({ ...u, [role]: { uploading: true, progress: p } }));
      }) as Promise<{ state: ProjectView }>);
      if (queue !== uploadQueue.current) return;
      setView(r.state); setGen(null); setUrl(r.state.project.id, null);
    } catch (e) { if (queue === uploadQueue.current) setError((e as Error).message); }
    finally { if (queue === uploadQueue.current) setUp((u) => ({ ...u, [role]: { uploading: false, progress: 0 } })); }
  };

  const useSample = async (id: string) => {
    if (uploadQueue.current.pending || loadingSample.current) return;
    loadingSample.current = true;
    setError(null); setBusy(true);
    try {
      const v = await api<ProjectView>("/api/samples", { method: "POST", json: { pairId: id } });
      uploadQueue.current = createProjectUploadQueue(v.project.id);
      setView(v); setGen(null); setUrl(v.project.id, null);
    } catch (e) { setError((e as Error).message); }
    finally { loadingSample.current = false; setBusy(false); }
  };

  const share = async () => {
    if (!gen) return;
    try {
      const r = await api<{ url: string }>("/api/share", { method: "POST", json: { generationId: gen.id } });
      await navigator.clipboard.writeText(r.url).catch(() => {});
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };
  const reset = () => {
    autoRecipe.current = null;
    setSelectedRecipeId(null);
    uploadQueue.current = createProjectUploadQueue();
    setUp({ start: { uploading: false, progress: 0 }, end: { uploading: false, progress: 0 } });
    setView(null); setGen(null); setError(null); analyzeRequested.current = null; setUrl(null, null);
  };

  const frames = { a: view?.boundary?.startFrameUrl ?? view?.assets.start?.thumbnailUrl ?? null, b: view?.boundary?.endFrameUrl ?? view?.assets.end?.thumbnailUrl ?? null };

  return (
    <div className="studio-shell mx-auto max-w-6xl px-5 pb-20">
      <StudioTabs active="create" />
      <div className="studio-topline mono"><Link href="/">CLIPMELT / STUDIO</Link><span><span className="studio-status-dot" /> YOUR NEXT GREAT CUT</span></div>
      <ol className="studio-phase-rail" aria-label="Creation progress">
        <li data-active={phase === "upload" || phase === "analyzing"} aria-current={phase === "upload" || phase === "analyzing" ? "step" : undefined}><span className="mono">01</span> Bring your clips</li>
        <li data-active={phase === "choose"} aria-current={phase === "choose" ? "step" : undefined}><span className="mono">02</span> Find your transition</li>
        <li data-active={phase === "generating" || phase === "ready" || phase === "failed"} aria-current={phase === "generating" || phase === "ready" || phase === "failed" ? "step" : undefined}><span className="mono">03</span> Make the cut</li>
      </ol>
      {/* ---------------------------------------------------------------- upload / analyzing */}
      {(phase === "upload" || phase === "analyzing") && (
        <div className="rise">
          <div className="studio-intro">
            <h1 className="display">Two clips.<br /><span>One impossible shot.</span></h1>
            <p>Bring the beginning and the end.<br />We’ll find a way through.</p>
          </div>
          {selectedStyle && <div className="mb-6 rounded-xl border border-[var(--hair)] p-5" role="status">
            <p className="text-[var(--accent)]">Selected style: <strong>{selectedStyle.name}</strong></p>
            <p className="mt-2 text-sm muted">Add your two clips. We’ll check they fit, then generate this transition. Each preview uses 2 credits.</p>
            <p className="mt-1 text-sm muted">{selectedStyle.needs}</p>
          </div>}
          <div className="studio-upload-grid grid gap-4 md:grid-cols-2">
            <DropZone role="start" asset={view?.assets.start ?? null} uploading={up.start.uploading} progress={up.start.progress} onFile={(f) => onFile("start", f)} disabled={phase === "analyzing" || busy} />
            <DropZone role="end" asset={view?.assets.end ?? null} uploading={up.end.uploading} progress={up.end.progress} onFile={(f) => onFile("end", f)} disabled={phase === "analyzing" || busy} />
          </div>
          {phase === "analyzing" ? (
            <div className="studio-analysis mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
              <Steps steps={ANALYZE_STEPS} current={view?.analysis.stageLabel || ANALYZE_STEPS[0]} />
              <p className="muted text-sm">We look at the last moments of your first clip and the first moments of your second, and design a cut that fits what is actually in the frame.</p>
            </div>
          ) : (
            <div className="studio-upload-help mt-6">
              <span className="muted text-sm">{view?.assets.start || view?.assets.end ? "Add the other clip to continue." : "Start with any two clips or images. Your transition begins here."}</span>
              {samples.length > 0 && !view?.assets.start && (
                <div className="studio-samples">
                  <div className="studio-samples-heading"><span className="mono muted">A LITTLE INSPIRATION</span><span className="muted text-xs">Try a sample pair</span></div>
                  <div className="studio-samples-grid">
                    {samples.map((s, i) => <button key={s.id} className="studio-sample" onClick={() => useSample(s.id)} disabled={busy || up.start.uploading || up.end.uploading}>
                      <span className="studio-sample-images"><img src={s.aPoster} alt="" /><img src={s.bPoster} alt="" /><span aria-hidden="true">↗</span></span>
                      <span className="studio-sample-caption"><span className="mono muted">0{i + 1}</span><span>{s.title}</span><span aria-hidden="true">→</span></span>
                    </button>)}
                  </div>
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
              <p className="mt-2 mono text-xs muted" aria-live="polite">{view.runsLeft} run{view.runsLeft === 1 ? "" : "s"} left · 2 credits per preview</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
            <div className="studio-surprise mt-8 flex flex-wrap items-center gap-4 hair rounded-2xl p-5">
              <button className="btn btn-accent" onClick={() => generate({ intent: "surprise", opportunityId: s.opportunity.id })} disabled={busy}>Surprise me</button>
              <div className="text-sm"><span>{s.opportunity.title}.</span> <span className="muted">{s.opportunity.why}</span></div>
            </div>
          ) : null; })()}
          {view.runtime.providers.length === 1 && <p className="mt-5 text-xs muted">Preview mode · These transitions use procedural effects. Generated camera moves become available when a video model is connected.</p>}
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
            <div className="progress-line mt-5" aria-hidden="true"><i style={{ width: `${Math.round(Math.max(0.05, Math.min(1, gen.progress)) * 100)}%` }} /></div>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs muted">
              <span>
                {Math.floor(Math.max(0, nowMs - Date.parse(gen.createdAt)) / 60000)}:{String(Math.floor(Math.max(0, nowMs - Date.parse(gen.createdAt)) / 1000) % 60).padStart(2, "0")} elapsed
                {gen.attemptLog.length > 1 ? ` · attempt ${gen.attemptLog.length}` : ""}
              </span>
              <span aria-live="polite">on this step {Math.round(Math.max(0, nowMs - stageSince.current.at) / 1000)}s</span>
            </div>
            <p className="mt-5 muted text-sm">{gen.stage === "retry" ? gen.stageLabel : "An AI bridge usually takes 3 to 5 minutes. The model keeps its own pace, so a step can sit still for a while; the clock above keeps counting while it works. You can leave this page: it keeps rendering, appears in your account, and this browser gets a notification when it's ready."}</p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- ready */}
      {phase === "ready" && gen?.result && (
        <div className="rise">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="display text-3xl md:text-4xl">Your transition is ready</h1>
            <div className="seg">
              <button data-on={videoMode === "full"} aria-pressed={videoMode === "full"} onClick={() => setVideoMode("full")}>Full video</button>
              <button data-on={videoMode === "bridge"} aria-pressed={videoMode === "bridge"} onClick={() => setVideoMode("bridge")}>Transition only</button>
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

          <DownloadOptions generationId={gen.id} result={gen.result} trackDownloads />

          <div className="mt-6 flex flex-wrap gap-2">
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
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => generate({ intent: "smooth" })} disabled={busy}>Try a safer transition</button>
            <button className="btn btn-ghost" onClick={() => generate({ from: { generationId: gen.id, action: "another" } })} disabled={busy}>Try another idea</button>
            <button className="btn btn-ghost" onClick={reset}>Change clips</button>
          </div>
        </div>
      )}

      {error && !needCredits && <Notice>{error}</Notice>}
      {needCredits && <Paywall freeRuns={3} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="studio-notice mt-4 rounded-xl px-4 py-3 text-sm" role="status">{children}</div>;
}
