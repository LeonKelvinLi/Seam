/** fal's documented account API requires an ADMIN key; a scoped key can be supplied separately. */
export interface BalanceStatus {
  ok: boolean;
  state: "ready" | "low" | "unknown" | "not_configured";
  balanceUsd: number | null;
  thresholdUsd: number;
  checkedAt: string;
}

export function createBalanceMonitor(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: BalanceStatus | undefined;
  let expires = 0;
  let pending: Promise<BalanceStatus> | undefined;
  return async function read(): Promise<BalanceStatus> {
    if (cached && now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      const key = (process.env.FAL_ADMIN_KEY || process.env.FAL_KEY || "").trim();
      const value = Number(process.env.SEAM_FAL_LOW_BALANCE_USD ?? 15);
      const thresholdUsd = Number.isFinite(value) && value >= 0 ? value : 15;
      const base = { balanceUsd: null, thresholdUsd, checkedAt: new Date(now()).toISOString() };
      let result: BalanceStatus = { ...base, ok: false, state: key ? "unknown" : "not_configured" };
      if (key) {
        try {
          const response = await fetcher("https://api.fal.ai/v1/account/billing?expand=credits", {
            headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(5000), cache: "no-store",
          });
          if (response.ok) {
            const body = await response.json();
            const balance = body?.credits?.current_balance;
            if (typeof balance === "number" && Number.isFinite(balance) && body?.credits?.currency?.toUpperCase() === "USD") {
              result = { ...base, balanceUsd: balance, ok: balance >= thresholdUsd, state: balance >= thresholdUsd ? "ready" : "low" };
            }
          } else if (response.status === 401 || response.status === 403) {
            // An ordinary (non-admin) key may not read the account API but can read its own USD balance here.
            const legacy = await fetcher("https://rest.alpha.fal.ai/billing/user_balance", {
              headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(5000), cache: "no-store",
            });
            const balance = legacy.ok ? Number(await legacy.text()) : NaN;
            if (Number.isFinite(balance)) {
              result = { ...base, balanceUsd: balance, ok: balance >= thresholdUsd, state: balance >= thresholdUsd ? "ready" : "low" };
            }
          }
        } catch { /* Unknown is an alert, never a fabricated zero or a stale success. */ }
      }
      cached = result;
      expires = now() + 60_000;
      return result;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

export const falBalanceStatus = createBalanceMonitor();
