export function Steps({ steps, current }: { steps: string[]; current: string }) {
  const idx = Math.max(0, steps.findIndex((s) => current.startsWith(s)));
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "now" : "todo";
        return (
          <li key={s} className="flex items-center gap-3" style={{ opacity: state === "todo" ? 0.35 : 1 }}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]" style={{ background: state === "done" ? "var(--fg)" : "transparent", color: state === "done" ? "#000" : "inherit", border: state === "done" ? "none" : "1px solid rgba(255,255,255,0.35)" }}>
              {state === "done" ? "✓" : state === "now" ? <span className="pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--fg)" }} /> : ""}
            </span>
            <span className={state === "now" ? "" : "muted"}>{i === idx && current !== s ? current : s}</span>
          </li>
        );
      })}
    </ol>
  );
}
