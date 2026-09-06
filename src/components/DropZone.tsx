"use client";
import { useRef, useState } from "react";

export interface DropAsset { id: string; kind: "video" | "image"; originalName: string; durationSec: number | null; thumbnailUrl: string | null; previewUrl: string | null }

export function DropZone({ role, asset, uploading, progress, onFile, disabled }: {
  role: "start" | "end"; asset: DropAsset | null; uploading: boolean; progress: number; onFile: (f: File) => void; disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const label = role === "start" ? "Start clip" : "End clip";
  const unavailable = Boolean(disabled || uploading);
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div
      className="dropzone frame aspect-video select-none"
      data-over={over}
      data-filled={Boolean(asset)}
      data-disabled={unavailable}
      onDragOver={(e) => { e.preventDefault(); if (!unavailable) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !unavailable) onFile(f); }}
      onClick={() => !unavailable && input.current?.click()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !unavailable) { e.preventDefault(); input.current?.click(); } }}
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      aria-busy={uploading}
      aria-label={uploading ? `Uploading ${label}: ${percent}%` : asset ? `Replace ${label}: ${asset.originalName}` : `Upload ${label}`}
    >
      <input ref={input} type="file" disabled={unavailable} accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp" className="hidden" onClick={(e) => e.stopPropagation()} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {asset?.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: uploading ? 0.4 : 1 }} />
      ) : null}
      <div className="dropzone-label mono"><span>{role === "start" ? "01" : "02"}</span>{label}<span className="dropzone-label-end">{role === "start" ? "IN" : "OUT"}</span></div>
      <span className="dropzone-corner dropzone-corner-a" aria-hidden="true" />
      <span className="dropzone-corner dropzone-corner-b" aria-hidden="true" />
      {asset ? (
        <div className="dropzone-file absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between text-sm" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
          <div className="truncate">{asset.originalName}</div>
          <div className="muted shrink-0 pl-3">{asset.kind === "image" ? "image" : asset.durationSec ? `${asset.durationSec.toFixed(1)}s` : ""}</div>
        </div>
      ) : (
        <div className="dropzone-empty absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="dropzone-plus" aria-hidden="true">+</div>
          <div className="dropzone-title">{uploading ? `Uploading ${percent}%` : role === "start" ? "Where it starts." : "Where it goes."}</div>
          <div className="dropzone-help">{uploading ? "Bringing your footage into the studio." : <>Drop a clip or <span>browse files ↗</span></>}</div>
          <div className="dropzone-formats mono">MP4 · MOV · WEBM · JPG · PNG · WEBP</div>
        </div>
      )}
      {uploading ? (
        <div className="absolute inset-x-0 bottom-0 z-20 h-1" role="progressbar" aria-label={`Uploading ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{ background: "rgba(255,255,255,0.12)" }}>
          <div className="h-full" style={{ width: `${percent}%`, background: "var(--fg)", transition: "width 120ms linear" }} />
        </div>
      ) : null}
    </div>
  );
}
