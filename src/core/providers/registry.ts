import { config } from "@/core/config";
import { falProvider } from "./fal";
import { localProvider } from "./local";
import { runwayProvider } from "./runway";
import { higgsfieldProvider } from "./higgsfield";
import type { ModelSpec, ProviderId, TransitionProvider } from "./types";
import { providerCoolingDown } from "./cooldown";

export const PROVIDERS: TransitionProvider[] = [localProvider, falProvider, runwayProvider, higgsfieldProvider];

export function getProvider(id: ProviderId): TransitionProvider {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}

export function allModels(): ModelSpec[] {
  return PROVIDERS.flatMap((p) => p.models);
}

export function availableModels(): ModelSpec[] {
  const force = config.providers.force;
  return PROVIDERS.filter((p) => p.isAvailable() && (!force || p.id === force) && !providerCoolingDown(p.id)).flatMap((p) => p.models);
}

export function getModel(id: string): ModelSpec {
  const m = allModels().find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model ${id}`);
  return m;
}
