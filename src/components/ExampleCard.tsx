"use client";
import { useEffect, useRef, useState } from "react";
import { Scene, type DemoExample } from "./DemoScenes";

export function ExampleCard({ example }: { example: DemoExample }) {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    fetch("/examples/manifest.json").then((r) => (r.ok ? r.json() : [])).then((list: { id: string; after: string }[]) => {
      const m = list.find((x) => x.id === example.id);
      if (m) setSrc(m.after);
    }).catch(() => {});
  }, [example.id]);
  return (
    <div className="frame grain aspect-video" onMouseEnter={() => ref.current?.play().catch(() => {})} onMouseLeave={() => ref.current?.pause()}>
      <div className="absolute inset-0">
        {src ? <video ref={ref} src={src} muted loop playsInline preload="metadata" className="h-full w-full object-cover" /> : (
          <div className="demo-after relative h-full w-full">
            <div className="scene-b absolute inset-0"><Scene kind={example.b} /></div>
            <div className="scene-a absolute inset-0"><Scene kind={example.a} /></div>
          </div>
        )}
      </div>
      <div className="absolute bottom-3 left-3 z-10 text-sm" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>{example.title}</div>
    </div>
  );
}
