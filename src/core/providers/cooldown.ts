/**
 * Provider cooldown. A billing or account failure (no credits, locked account) will not fix itself within a
 * generation, so the provider is parked for a while and the router skips it instead of re-uploading frames
 * and burning latency on every run. In-process state is enough for a single instance.
 */
import type { ProviderId } from "./types";

const parkedUntil = new Map<ProviderId, number>();
export const DEFAULT_COOLDOWN_MS = 10 * 60_000;

export function isBillingError(message: string): boolean {
  return /not_enough_credits|insufficient|exhausted balance|user is locked|payment required|quota/i.test(message);
}

export function markProviderUnavailable(id: ProviderId, ms = DEFAULT_COOLDOWN_MS, now = Date.now()): void {
  if (id === "local") return;
  parkedUntil.set(id, now + ms);
}

export function providerCoolingDown(id: ProviderId, now = Date.now()): boolean {
  const t = parkedUntil.get(id);
  if (t === undefined) return false;
  if (t <= now) { parkedUntil.delete(id); return false; }
  return true;
}

export function coolingDownProviders(now = Date.now()): ProviderId[] {
  return [...parkedUntil.keys()].filter((id) => providerCoolingDown(id, now));
}

export function _resetCooldownsForTests(): void { parkedUntil.clear(); }
