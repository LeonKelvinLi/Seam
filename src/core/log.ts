/* Minimal structured logger. Swap for pino/otel later without touching call sites. */
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.SEAM_LOG_LEVEL as Level) ?? "info"] ?? 20;

function emit(level: Level, scope: string, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const line = `[seam:${scope}] ${msg}` + (data ? " " + JSON.stringify(data) : "");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(scope: string) {
  return {
    debug: (m: string, d?: Record<string, unknown>) => emit("debug", scope, m, d),
    info: (m: string, d?: Record<string, unknown>) => emit("info", scope, m, d),
    warn: (m: string, d?: Record<string, unknown>) => emit("warn", scope, m, d),
    error: (m: string, d?: Record<string, unknown>) => emit("error", scope, m, d),
  };
}
