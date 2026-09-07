/** Runs once when the Node server starts: recover interrupted jobs and start housekeeping. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("@/lib/server/boot");
    boot();
  }
}
