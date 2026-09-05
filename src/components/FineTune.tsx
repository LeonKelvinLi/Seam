"use client";
import type { FineTune } from "@/core/types";

const SLIDERS: { key: keyof FineTune; label: string; lo: string; hi: string }[] = [
  { key: "intensity", label: "Transition intensity", lo: "Smooth", hi: "Insane" },
  { key: "duration", label: "Duration", lo: "Fast", hi: "Slow" },
  { key: "cameraMovement", label: "Camera movement", lo: "Low", hi: "High" },
  { key: "creativity", label: "Creativity", lo: "Faithful", hi: "Experimental" },
];

export function FineTunePanel({ value, onChange, onApply, busy }: { value: FineTune; onChange: (v: FineTune) => void; onApply: () => void; busy: boolean }) {
  return (
    <div className="hair rounded-2xl p-5">
      <div className="grid gap-5 md:grid-cols-2">
        {SLIDERS.map((s) => (
          <label key={s.key} className="block">
            <div className="flex justify-between text-sm"><span>{s.label}</span></div>
            <input type="range" min={0} max={100} value={Math.round(value[s.key] * 100)} onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) / 100 })} className="mt-3" />
            <div className="mt-1 flex justify-between text-xs muted"><span>{s.lo}</span><span>{s.hi}</span></div>
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end"><button className="btn btn-primary btn-sm" onClick={onApply} disabled={busy}>Regenerate with these settings</button></div>
    </div>
  );
}
