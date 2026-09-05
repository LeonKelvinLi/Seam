"use client";
import { useRef, useState } from "react";

export interface DropAsset { id: string; kind: "video" | "image"; originalName: string; durationSec: number | null; thumbnailUrl: string | null; previewUrl: string | null }

export function DropZone({ role, asset, uploading, progress, onFile, disabled }: {
  role: "start" | "end"; asset: DropAsset | null; uploading: boolean; progress: number; onFile: (f: File) => void; disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const label = role === "start" ? "Start clip" : "End clip";
  return (
    <div
      className="dropzone frame grain aspect-video cursor-pointer select-none"
      data-over={over}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}
      onClick={() => !disabled && input.current?.click()}
      role="button"
      aria-label={`Upload ${label}`}
    >
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {asset?.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: uploading ? 0.4 : 1 }} />
      ) : null}
      <div className="absolute left-4 top-4 z-10 mono uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</div>
      {asset ? (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between text-sm" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
          <div className="truncate">{asset.originalName}</div>
          <div className="muted shrink-0 pl-3">{asset.kind === "image" ? "image" : asset.durationSec ? `${asset.durationSec.toFixed(1)}s` : ""}</div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-3xl" style={{ opacity: 0.5 }}>+</div>
          <div>Drop {role === "start" ? "your first clip" : "your second clip"}</div>
          <div className="muted text-xs">MP4 · MOV · WebM · JPG · PNG · WebP</div>
        </div>
      )}
      {uploading ? (
        <div className="absolute inset-x-0 bottom-0 z-20 h-1" style={{ background: "rgba(255,255,255,0.12)" }}>
          <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, background: "var(--fg)", transition: "width 120ms linear" }} />
        </div>
      ) : null}
    </div>
  );
}
