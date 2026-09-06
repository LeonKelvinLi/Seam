export function Steps({ steps, current }: { steps: string[]; current: string }) {
  const idx = Math.max(0, steps.findIndex((s) => current.startsWith(s)));
  return (
    <ol className="studio-steps space-y-3" aria-label="Processing progress" aria-live="polite">
      {steps.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "now" : "todo";
        return (
          <li key={s} className="flex items-center gap-3" data-state={state} aria-current={state === "now" ? "step" : undefined}>
            <span className="studio-step-marker inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
              {state === "done" ? "✓" : state === "now" ? <span className="pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> : String(i + 1).padStart(2, "0")}
            </span>
            <span className={state === "now" ? "" : "muted"}>{i === idx && current !== s ? current : s}</span>
          </li>
        );
      })}
    </ol>
  );
}
