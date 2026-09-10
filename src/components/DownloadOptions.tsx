"use client";

import type { GenerationView } from "@/lib/server/views";
import { api } from "@/lib/api";

export function DownloadOptions({ generationId, result, trackDownloads = false }: {
  generationId: string;
  result: NonNullable<GenerationView["result"]>;
  trackDownloads?: boolean;
}) {
  const options = [
    { kind: "bridge", label: "Transition only", description: "Just the transition, ready to use in your own edit.", url: result.bridgeUrl, duration: result.bridgeDurationSec, filename: "transition" },
    { kind: "full", label: "Full video", description: "Both clips joined together with your transition.", url: result.fullUrl, duration: result.fullDurationSec, filename: "full-video" },
  ];

  return (
    <section className="mt-7" aria-labelledby="download-heading">
      <h2 id="download-heading" className="text-lg font-medium">Download</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          if (!option.url) return null;
          const filename = `seamcut-${option.filename}-${generationId}.mp4`;
          const href = `${option.url}${option.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
          return (
            <a key={option.kind} href={href} download={filename} aria-label={`Download ${option.label.toLowerCase()}`}
              className="group flex flex-col rounded-xl border border-[var(--hair)] bg-[var(--bg2)] p-5 transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
              onClick={() => {
                if (trackDownloads) void api(`/api/generations/${generationId}/feedback`, { method: "POST", json: { action: `download_${option.kind}` } }).catch(() => {});
              }}>
              <span className="flex items-center justify-between gap-3">
                <span className="font-medium">{option.label}</span>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                  <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
                </svg>
              </span>
              <span className="mt-2 text-sm muted">{option.description}</span>
              <span className="mt-4 text-xs text-[var(--accent)]">Download MP4 · {option.duration.toFixed(1)}s</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
