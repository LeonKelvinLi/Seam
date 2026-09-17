import { Generations, Jobs } from "@/db/repo";
import { startRunner } from "@/core/pipeline/runner";
import { startMaintenance } from "@/lib/server/maintenance";
import { logger } from "@/core/log";

const log = logger("boot");

declare global {
  // eslint-disable-next-line no-var
  var __seamBooted: boolean | undefined;
}

/** Idempotent server start-up: requeue jobs orphaned by the previous process, then run the queue and housekeeping. */
export function boot() {
  if (globalThis.__seamBooted) return;
  globalThis.__seamBooted = true;
  try {
    const n = Jobs.requeueStale();
    if (n) log.info("requeued stale jobs", { count: n });
    const restored = Generations.restoreFinished();
    if (restored) log.info("restored finished generations left running", { count: restored });
    startRunner();
    startMaintenance();
  } catch (e) {
    log.error("boot failed", { error: (e as Error).message });
  }
}
