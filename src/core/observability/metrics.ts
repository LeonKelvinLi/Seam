/**
 * Funnel, latency, quality and cost metrics (spec §27, §31). Computed straight from SQLite;
 * swap the queries for your warehouse later.
 */
import { db } from "@/db/client";

const FUNNEL = [
  "landing_view", "upload_completed", "analysis_completed", "transition_selected", "generation_started",
  "generation_succeeded", "downloaded", "second_project_created",
] as const;

export function computeMetrics() {
  const d = db();
  const count = (sql: string, ...p: unknown[]) => (d.prepare(sql).get(...p) as { c: number }).c;
  const avg = (sql: string, ...p: unknown[]) => (d.prepare(sql).get(...p) as { v: number | null }).v ?? 0;

  const funnel = FUNNEL.map((name) => ({
    step: name,
    users: count("SELECT COUNT(DISTINCT COALESCE(userId, id)) c FROM events WHERE name=?", name),
    events: count("SELECT COUNT(*) c FROM events WHERE name=?", name),
  }));

  const generations = count("SELECT COUNT(*) c FROM generations");
  const succeeded = count("SELECT COUNT(*) c FROM generations WHERE status='ready'");
  const failed = count("SELECT COUNT(*) c FROM generations WHERE status='failed'");
  const attempts = count("SELECT COUNT(*) c FROM attempts");
  const providerErrors = count("SELECT COUNT(*) c FROM attempts WHERE status='failed'");
  const rejected = count("SELECT COUNT(*) c FROM attempts WHERE status='rejected'");
  const totalCost = avg("SELECT SUM(usd) v FROM costs");
  const genCost = avg("SELECT SUM(usd) v FROM costs WHERE kind='generation'");
  const analysisCost = avg("SELECT SUM(usd) v FROM costs WHERE kind='analysis'");
  const judgeCost = avg("SELECT SUM(usd) v FROM costs WHERE kind='judge'");

  const byModel = d.prepare(
    `SELECT modelId, COUNT(*) n, AVG(costUsd) avgCost, AVG(durationMs) avgMs,
            SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END) ok
     FROM attempts GROUP BY modelId ORDER BY n DESC`,
  ).all() as { modelId: string; n: number; avgCost: number; avgMs: number; ok: number }[];

  const byRecipe = d.prepare(
    `SELECT g.recipeId, COUNT(*) n, AVG(l.qualityOverall) quality, AVG(l.retryCount) retries,
            SUM(l.userDownloaded) downloads, SUM(l.userShared) shares, SUM(l.userRegenerated) regenerated
     FROM generations g LEFT JOIN learningRecords l ON l.generationId=g.id GROUP BY g.recipeId ORDER BY n DESC LIMIT 20`,
  ).all() as { recipeId: string; n: number; quality: number | null; retries: number | null; downloads: number; shares: number; regenerated: number }[];

  return {
    funnel,
    generation: {
      total: generations, succeeded, failed, successRate: generations ? succeeded / generations : 0,
      attemptsPerGeneration: generations ? attempts / generations : 0, providerErrors, qualityRejections: rejected,
      avgLatencyMs: avg("SELECT AVG((julianday(finishedAt)-julianday(startedAt))*86400000) v FROM jobs WHERE type='generate' AND status='done'"),
      avgQuality: avg("SELECT AVG(qualityOverall) v FROM learningRecords"),
    },
    analysis: {
      avgLatencyMs: avg("SELECT AVG((julianday(finishedAt)-julianday(startedAt))*86400000) v FROM jobs WHERE type='analyze' AND status='done'"),
      failures: count("SELECT COUNT(*) c FROM jobs WHERE type='analyze' AND status='failed'"),
    },
    uploads: { failures: count("SELECT COUNT(*) c FROM events WHERE name='upload_failed'") },
    exports: { failures: count("SELECT COUNT(*) c FROM events WHERE name='export_failed'"), downloads: count("SELECT COUNT(*) c FROM events WHERE name='downloaded'") },
    cost: {
      totalUsd: totalCost, generationUsd: genCost, analysisUsd: analysisCost, judgeUsd: judgeCost,
      perGenerationUsd: generations ? totalCost / generations : 0,
      perSuccessfulGenerationUsd: succeeded ? totalCost / succeeded : 0,
      retryUsd: avg("SELECT SUM(c.usd) v FROM costs c JOIN attempts a ON a.id=c.attemptId WHERE a.n>1"),
    },
    byModel,
    byRecipe,
  };
}
