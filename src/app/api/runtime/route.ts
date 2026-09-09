import { json } from "@/lib/server/session";
import { config, describeRuntime } from "@/core/config";
import { availableModels } from "@/core/providers/registry";
import { coolingDownProviders } from "@/core/providers/cooldown";
import { budgetStatus } from "@/core/pipeline/budget";
import { thresholdFor } from "@/core/quality/judge";

/** What this deployment can actually do: analysis mode, keyed providers, any override, and the models that can bridge two frames. */
export async function GET() {
  return json({
    version: (process.env.RENDER_GIT_COMMIT ?? "dev").slice(0, 7),
    ...describeRuntime(),
    coolingDown: coolingDownProviders(),
    budget: budgetStatus(),
    qualityThresholds: { preview: thresholdFor("preview"), final: thresholdFor("final") },
    parallelAttempts: config.generation.parallelAttempts,
    bridgeModels: availableModels().filter((m) => m.supportsLastFrame && m.providerId !== "local").map((m) => m.id),
  });
}
