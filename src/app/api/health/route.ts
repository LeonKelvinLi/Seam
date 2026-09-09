/**
 * Deep health for external monitors (Render's own check stays on /api/runtime, which never restarts the box for a
 * full disk). 200 when the database answers, ffmpeg runs and the data disk has room; 503 otherwise, with details.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { config } from "@/core/config";
import { db } from "@/db/client";
import { Jobs } from "@/db/repo";
import { coolingDownProviders } from "@/core/providers/cooldown";
import { budgetStatus } from "@/core/pipeline/budget";

let ffmpegOk: boolean | null = null;
const MIN_FREE_BYTES = 500 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string | number }> = {};
  try { db().prepare("SELECT 1").get(); checks.database = { ok: true }; } catch (e) { checks.database = { ok: false, detail: (e as Error).message }; }
  if (ffmpegOk === null) { try { ffmpegOk = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { timeout: 5000 }).status === 0; } catch { ffmpegOk = false; } }
  checks.ffmpeg = { ok: ffmpegOk };
  try {
    const st = fs.statfsSync(config.dataDir);
    const free = st.bavail * st.bsize;
    checks.disk = { ok: free > MIN_FREE_BYTES, detail: `${Math.round(free / 1024 / 1024)} MB free` };
  } catch (e) { checks.disk = { ok: false, detail: (e as Error).message }; }
  let queued = 0;
  try { queued = Jobs.queuedCount(); } catch { /* database check already failed */ }
  const budget = budgetStatus();
  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json({
    ok, checks, queuedJobs: queued, coolingDown: coolingDownProviders(), budget,
    version: (process.env.RENDER_GIT_COMMIT ?? "dev").slice(0, 7), time: new Date().toISOString(),
  }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
