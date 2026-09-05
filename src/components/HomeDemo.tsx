"use client";
import { useEffect, useRef, useState } from "react";
import { DEMO_EXAMPLES, Scene } from "./DemoScenes";
import { track } from "@/lib/api";

interface ExampleMedia { id: string; title: string; before: string; after: string; a: string; b: string; poster?: string }

export function HomeDemo() {
  const [mode, setMode] = useState<"before" | "after">("after");
  const [idx, setIdx] = useState(0);
  const [media, setMedia] = useState<Record<string, ExampleMedia>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ex = DEMO_EXAMPLES[idx];
  const real = media[ex.id];

  useEffect(() => {
    fetch("/examples/manifest.json").then((r) => (r.ok ? r.json() : [])).then((list: ExampleMedia[]) => {
      const m: Record<string, ExampleMedia> = {};
      for (const e of list) m[e.id] = e;
      setMedia(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (v) { v.load(); v.play().catch(() => {}); }
  }, [mode, idx, real]);

  return (
    <section className="mx-auto max-w-6xl px-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1.4fr_auto_1fr] md:items-center">
        <Tile label="Clip A">{real ? <video src={real.a} muted loop playsInline autoPlay className="h-full w-full object-cover" /> : <Scene kind={ex.a} />}</Tile>
        <Arrow />
        <Tile label={mode === "after" ? "AI transition" : "Hard cut"} big>
          {real ? (
            <video key={mode + ex.id} ref={videoRef} src={mode === "after" ? real.after : real.before} muted loop playsInline autoPlay className="h-full w-full object-cover" />
          ) : (
            <div className={`relative h-full w-full ${mode === "after" ? "demo-after" : "demo-before"}`}>
              <div className="scene-b absolute inset-0"><Scene kind={ex.b} /></div>
              <div className="scene-a absolute inset-0" style={{ transformOrigin: "50% 50%" }}><Scene kind={ex.a} /></div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10 rounded-full px-2.5 py-1 text-xs" style={{ background: "rgba(0,0,0,0.55)" }}>{mode === "after" ? ex.move : "Cut"}</div>
        </Tile>
        <Arrow />
        <Tile label="Clip B">{real ? <video src={real.b} muted loop playsInline autoPlay className="h-full w-full object-cover" /> : <Scene kind={ex.b} />}</Tile>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="seg">
          <button data-on={mode === "before"} onClick={() => setMode("before")}>Before</button>
          <button data-on={mode === "after"} onClick={() => setMode("after")}>After</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DEMO_EXAMPLES.map((e, i) => (
            <button key={e.id} className="chip" data-on={i === idx} onClick={() => { setIdx(i); track("example_switched", { id: e.id }); }}>{e.title}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tile({ label, children, big }: { label: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div className={`frame grain ${big ? "aspect-video" : "aspect-video md:aspect-[4/3]"}`}>
      <div className="absolute inset-0">{children}</div>
      <div className="absolute left-3 top-3 z-10 mono uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</div>
    </div>
  );
}

function Arrow() {
  return <div className="hidden justify-center md:flex"><span className="muted text-xl">→</span></div>;
}
