import { json } from "@/lib/server/session";
import { describeRuntime } from "@/core/config";
import { availableModels } from "@/core/providers/registry";
import { coolingDownProviders } from "@/core/providers/cooldown";

/** What this deployment can actually do: analysis mode, keyed providers, any override, and the models that can bridge two frames. */
export async function GET() {
  return json({
    ...describeRuntime(),
    coolingDown: coolingDownProviders(),
    bridgeModels: availableModels().filter((m) => m.supportsLastFrame && m.providerId !== "local").map((m) => m.id),
  });
}
