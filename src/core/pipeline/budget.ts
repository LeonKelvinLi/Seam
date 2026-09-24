/**
 * Daily provider spend guard: once the day's generation fees pass the budget, the router stays on ffmpeg until
 * midnight UTC. Free-trial runs stop at the free budget; customers who have paid run on until the higher paid one.
 */
import { config } from "@/core/config";
import { db } from "@/db/client";

export function providerSpendTodayUsd(now = new Date()): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const row = db().prepare("SELECT COALESCE(SUM(usd), 0) AS usd FROM costs WHERE kind='generation' AND createdAt >= ?").get(start) as { usd: number };
  return row.usd;
}

export function budgetStatus(now = new Date(), paid = false): { todayUsd: number; limitUsd: number; paidLimitUsd: number; exhausted: boolean } {
  const freeLimit = config.generation.dailyBudgetUsd;
  const paidLimitUsd = Math.max(freeLimit, config.generation.dailyPaidBudgetUsd);
  const limitUsd = paid ? paidLimitUsd : freeLimit;
  const todayUsd = providerSpendTodayUsd(now);
  return { todayUsd: Math.round(todayUsd * 100) / 100, limitUsd: freeLimit, paidLimitUsd, exhausted: limitUsd > 0 && todayUsd >= limitUsd };
}

export const budgetExhausted = (paid = false) => budgetStatus(new Date(), paid).exhausted;
