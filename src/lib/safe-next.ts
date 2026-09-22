/** Where to go after signing in: only same-site paths, anything else falls back to the studio (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/create";
}
