"use client";
import type { OpportunityView } from "@/lib/server/views";

const GLYPH: Record<string, string> = {
  "zoom-in": "⤢", "zoom-out": "⤡", "whip-left": "←", "whip-right": "→", "whip-up": "↑", "whip-down": "↓", dissolve: "◐", flash: "✦",
  spin: "↻", circle: "◎", blur: "≈", squeeze: "▮", radial: "✺", pixel: "▦",
};

export function LaneCard({ lane, label, blurb, opportunity, frames, onPick, busy, featured }: {
  lane: string; label: string; blurb: string; opportunity: OpportunityView; frames: { a: string | null; b: string | null }; onPick: () => void; busy: boolean; featured?: boolean;
}) {
  return (
    <button onClick={onPick} disabled={busy} className={`rise group text-left ${featured ? "md:col-span-2" : ""}`}>
      <div className="frame grain aspect-video">
        <div className="absolute inset-0 grid grid-cols-2">
          {frames.a ? <img src={frames.a} alt="" className="h-full w-full object-cover" style={{ transformOrigin: "50% 50%", transition: "transform 900ms ease" }} /> : <div />}
          {frames.b ? <img src={frames.b} alt="" className="h-full w-full object-cover" /> : <div />}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform group-hover:scale-110" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>{GLYPH[opportunity.recipe.local.kind] ?? "→"}</span>
        </div>
        <div className="absolute left-3 top-3 mono uppercase" style={{ color: lane === "surprise" ? "var(--accent)" : "rgba(255,255,255,0.75)" }}>{label}</div>
      </div>
      <div className="mt-3 text-lg leading-tight">{opportunity.title}</div>
      <div className="mt-1 muted text-sm">{opportunity.why}</div>
      <div className="mt-1 text-xs muted" style={{ opacity: 0.7 }}>{opportunity.motivatedBy ? `Because ${opportunity.motivatedBy}. ` : ""}{blurb}</div>
    </button>
  );
}
