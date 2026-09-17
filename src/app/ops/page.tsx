import { computeMetrics } from "@/core/observability/metrics";
import { describeRuntime } from "@/core/config";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { opsAccessAllowed } from "@/lib/server/ops-access";
import { falBalanceStatus } from "@/lib/server/provider-health";
import { backupStatus } from "@/lib/server/offsite-backup";

export const dynamic = "force-dynamic";

const usd = (v: number) => `$${v.toFixed(3)}`;
const ms = (v: number) => (v ? `${(v / 1000).toFixed(1)}s` : "–");

export default async function OpsPage() {
  if (!opsAccessAllowed((await headers()).get("authorization"))) notFound();
  const m = computeMetrics();
  const rt = describeRuntime();
  const fal = await falBalanceStatus();
  const backup = backupStatus();
  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8 text-sm">
      <h1 className="display text-3xl">Ops</h1>
      <p className="mt-2 muted">vision: {rt.vision} · judge: {rt.judge} · providers: {rt.providers.join(", ")} · mode: {rt.mode}</p>
      <Section title="Launch readiness">
        <KV k="fal balance" v={fal.balanceUsd === null ? fal.state : `${usd(fal.balanceUsd)} · ${fal.state}`} />
        <KV k="fal alert threshold" v={usd(fal.thresholdUsd)} />
        <KV k="off-site backup" v={backup.state} />
        <KV k="last upload" v={backup.lastSuccessAt ?? "None verified"} />
      </Section>

      <Section title="Funnel">
        <table className="w-full"><tbody>
          {m.funnel.map((f) => <tr key={f.step} className="hair-t"><td className="py-2 mono">{f.step}</td><td className="py-2 text-right">{f.users} users</td><td className="py-2 text-right muted">{f.events} events</td></tr>)}
        </tbody></table>
      </Section>

      <div className="grid gap-8 md:grid-cols-3">
        <Section title="Generation">
          <KV k="total" v={m.generation.total} /><KV k="succeeded" v={m.generation.succeeded} /><KV k="failed" v={m.generation.failed} />
          <KV k="success rate" v={`${Math.round(m.generation.successRate * 100)}%`} /><KV k="attempts / generation" v={m.generation.attemptsPerGeneration.toFixed(2)} />
          <KV k="provider errors" v={m.generation.providerErrors} /><KV k="quality rejections" v={m.generation.qualityRejections} />
          <KV k="avg latency" v={ms(m.generation.avgLatencyMs)} /><KV k="avg quality" v={m.generation.avgQuality ? m.generation.avgQuality.toFixed(0) : "–"} />
        </Section>
        <Section title="Analysis & exports">
          <KV k="analysis latency" v={ms(m.analysis.avgLatencyMs)} /><KV k="analysis failures" v={m.analysis.failures} />
          <KV k="upload failures" v={m.uploads.failures} /><KV k="downloads" v={m.exports.downloads} /><KV k="export failures" v={m.exports.failures} />
        </Section>
        <Section title="Cost">
          <KV k="total" v={usd(m.cost.totalUsd)} /><KV k="generation" v={usd(m.cost.generationUsd)} /><KV k="analysis" v={usd(m.cost.analysisUsd)} /><KV k="judge" v={usd(m.cost.judgeUsd)} />
          <KV k="per generation" v={usd(m.cost.perGenerationUsd)} /><KV k="per successful generation" v={usd(m.cost.perSuccessfulGenerationUsd)} /><KV k="spent on retries" v={usd(m.cost.retryUsd)} />
        </Section>
      </div>

      <Section title="By model">
        <table className="w-full"><tbody>
          {m.byModel.map((r) => <tr key={r.modelId} className="hair-t"><td className="py-2 mono">{r.modelId}</td><td className="py-2 text-right">{r.n} attempts</td><td className="py-2 text-right">{r.ok} ok</td><td className="py-2 text-right muted">{usd(r.avgCost ?? 0)} avg</td><td className="py-2 text-right muted">{ms(r.avgMs ?? 0)}</td></tr>)}
        </tbody></table>
      </Section>
      <Section title="By recipe">
        <table className="w-full"><tbody>
          {m.byRecipe.map((r) => <tr key={r.recipeId} className="hair-t"><td className="py-2 mono">{r.recipeId}</td><td className="py-2 text-right">{r.n}</td><td className="py-2 text-right">q {r.quality ? r.quality.toFixed(0) : "–"}</td><td className="py-2 text-right muted">retries {(r.retries ?? 0).toFixed(1)}</td><td className="py-2 text-right muted">↓{r.downloads ?? 0} ↗{r.shares ?? 0} ↻{r.regenerated ?? 0}</td></tr>)}
        </tbody></table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10"><h2 className="mono muted uppercase mb-3">{title}</h2>{children}</section>;
}
function KV({ k, v }: { k: string; v: string | number }) {
  return <div className="hair-t flex justify-between py-2"><span className="muted">{k}</span><span>{v}</span></div>;
}
