/**
 * Production flow test, run against any base URL (local `next start` or the live service):
 *   upload two clips as a fresh guest → boundary frames (last frame of A, first frame of B) → analysis →
 *   three free transition runs → fourth run refused with 402 → balance is zero.
 *
 *   E2E_BASE_URL=https://seamcut.onrender.com npx tsx scripts/e2e.ts
 */
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const FREE_RUNS = Number(process.env.E2E_FREE_RUNS ?? 3);
const A = process.env.E2E_CLIP_A ?? path.join(process.cwd(), "public/samples/coffee-ocean-a.mp4");
const B = process.env.E2E_CLIP_B ?? path.join(process.cwd(), "public/samples/coffee-ocean-b.mp4");
const jar = new Map<string, string>();
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const fail = (m: string): never => { console.error(`E2E FAILED: ${m}`); process.exit(1); };

async function call(pathname: string, init: RequestInit = {}): Promise<{ status: number; body: any; res: Response }> {
  const res = await fetch(BASE + pathname, { ...init, headers: { ...(init.headers ?? {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
  const text = await res.text();
  let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, res };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upload(role: "start" | "end", file: string, projectId?: string) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)], { type: "video/mp4" }), path.basename(file));
  fd.append("role", role);
  if (projectId) fd.append("projectId", projectId);
  const r = await call("/api/upload", { method: "POST", body: fd });
  if (r.status !== 200) fail(`upload ${role}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body as { project: { id: string }; asset: { id: string; kind: string; durationSec: number | null; thumbnailUrl: string | null } };
}

async function main() {
  log(`base ${BASE}`);
  const runtime = await call("/api/runtime");
  log(`runtime: ${JSON.stringify(runtime.body)}`);
  const a = await upload("start", A);
  const projectId = a.project.id;
  const b = await upload("end", B, projectId);
  log(`project ${projectId}: A ${a.asset.durationSec}s, B ${b.asset.durationSec}s`);
  if (!a.asset.thumbnailUrl || !b.asset.thumbnailUrl) fail("uploads did not produce boundary thumbnails");

  const an = await call(`/api/projects/${projectId}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (an.status !== 200) fail(`analyze: ${an.status} ${JSON.stringify(an.body).slice(0, 200)}`);
  let view: any = null;
  for (let i = 0; i < 160; i++) {
    await sleep(1500);
    view = (await call(`/api/projects/${projectId}`)).body;
    const st = view?.analysis?.status;
    if (st === "done") break;
    if (st === "failed") fail(`analysis failed: ${view?.project?.analysisError}`);
  }
  if (view?.analysis?.status !== "done") fail("analysis timed out");
  const bd = view.boundary;
  if (!bd?.startFrameUrl || !bd?.endFrameUrl) fail("boundary frames missing");
  const durA = a.asset.durationSec ?? 0;
  if (a.asset.kind === "video" && durA && bd.cutA < durA - 1.6) fail(`cutA ${bd.cutA} is not near the end of clip A (${durA}s)`);
  if (b.asset.kind === "video" && bd.cutB > 1.6) fail(`cutB ${bd.cutB} is not near the start of clip B`);
  log(`boundary ok: A last frame at ${bd.cutA.toFixed(2)}s of ${durA}s, B first frame at ${bd.cutB.toFixed(2)}s; lanes: ${(view.recommendations ?? []).map((l: any) => l.lane).join(", ")}`);
  log(`credits before runs: ${view.credits}`);
  if (view.credits !== FREE_RUNS) fail(`fresh guest should have ${FREE_RUNS} free runs, has ${view.credits}`);

  for (let run = 1; run <= FREE_RUNS; run++) {
    const g = await call(`/api/projects/${projectId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (g.status !== 200) fail(`generate run ${run}: ${g.status} ${JSON.stringify(g.body).slice(0, 200)}`);
    const genId = g.body.generation.id;
    let gen: any = null;
    for (let i = 0; i < 400; i++) {
      await sleep(1500);
      gen = (await call(`/api/generations/${genId}`)).body?.generation;
      if (gen?.status === "ready" || gen?.status === "failed") break;
    }
    if (gen?.status !== "ready") fail(`run ${run} ended ${gen?.status}: ${gen?.friendlyError ?? gen?.stageLabel}`);
    const media = await fetch(BASE + gen.result.fullUrl, { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    const bytes = (await media.arrayBuffer()).byteLength;
    if (!media.ok || bytes < 50_000) fail(`run ${run} result not downloadable (${media.status}, ${bytes} bytes)`);
    if (!(gen.result.bridgeDurationSec > 0)) fail(`run ${run} has no bridge`);
    log(`run ${run} ready: ${gen.result.providerId}/${gen.result.modelLabel}, bridge ${gen.result.bridgeDurationSec}s, full ${gen.result.fullDurationSec}s, ${(bytes / 1e6).toFixed(1)} MB, quality ${gen.result.quality?.overall ?? "n/a"}, attempts ${gen.result.attempts}`);
  }
  const blocked = await call(`/api/projects/${projectId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (blocked.status !== 402 || blocked.body?.code !== "NO_CREDITS") fail(`run ${FREE_RUNS + 1} should be refused with 402 NO_CREDITS, got ${blocked.status} ${JSON.stringify(blocked.body).slice(0, 120)}`);
  // Guests are not "users" on the account endpoint; the project view carries the balance for both.
  const after = (await call(`/api/projects/${projectId}`)).body;
  if (after?.credits !== 0) fail(`balance should be 0 after the trial, is ${after?.credits}`);
  log(`paywall ok: run ${FREE_RUNS + 1} refused with 402, balance 0`);
  console.log("E2E PASSED");
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
