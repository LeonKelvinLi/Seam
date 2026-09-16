import { json } from "@/lib/server/session";
import { config, describeRuntime } from "@/core/config";
import { availableModels } from "@/core/providers/registry";
import { routeModels, expectedProfile } from "@/core/providers/router";
import { RECIPES } from "@/core/recipes/catalog";
import { Attempts } from "@/db/repo";
import { coolingDownProviders } from "@/core/providers/cooldown";
import { budgetStatus } from "@/core/pipeline/budget";
import { thresholdFor } from "@/core/quality/judge";

/** What this deployment can actually do: analysis mode, keyed providers, any override, and the models that can bridge two frames. */
/** How a generic-class preview would route right now, with the measured profile behind each choice. */
function previewRoute() {
  const recipe = RECIPES.find((r) => r.modelClass === "generic") ?? RECIPES[0];
  const measured = Attempts.modelStats();
  return routeModels({ recipe, mode: "preview", measured }).filter((m) => m.providerId !== "local").slice(0, 4).map((m) => {
    const p = expectedProfile(m, measured[m.id]);
    return { model: m.id, acceptance: +p.acceptance.toFixed(2), expectedWaitSec: Math.round(p.expectedWaitSec), expectedCostUsd: +p.expectedCostUsd.toFixed(2), judged: p.judged };
  });
}

export async function GET() {
  return json({
    version: (process.env.RENDER_GIT_COMMIT ?? "dev").slice(0, 7),
    ...describeRuntime(),
    coolingDown: coolingDownProviders(),
    budget: budgetStatus(),
    qualityThresholds: { preview: thresholdFor("preview"), final: thresholdFor("final") },
    parallelAttempts: config.generation.parallelAttempts,
    previewRoute: previewRoute(),
    bridgeModels: availableModels().filter((m) => m.supportsLastFrame && m.providerId !== "local").map((m) => m.id),
  });
}
