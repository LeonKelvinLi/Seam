/**
 * Production flow test, run against any base URL (local `next start` or the live service):
 *   upload two clips as a fresh guest → boundary frames (last frame of A, first frame of B) → analysis →
 *   a clip over 10 MB uploads → three free transition runs → every run still ready once its fan-out siblings land →
 *   fourth run refused with 402 → balance is zero.
 *
 *   E2E_BASE_URL=https://seamcut.onrender.com npx tsx scripts/e2e.ts
 *
 * One paid run whose video you want to watch afterwards (the guest session dies with the process otherwise):
 *   E2E_RUNS=1 E2E_SAVE_DIR=data/live-results/<name> E2E_BASE_URL=https://seamcut.onrender.com npx tsx scripts/e2e.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const FREE_RUNS = Number(process.env.E2E_FREE_RUNS ?? 3);
const RUNS = Number(process.env.E2E_RUNS ?? FREE_RUNS);
const A = process.env.E2E_CLIP_A ?? path.join(process.cwd(), "public/samples/coffee-ocean-a.mp4");
const B = process.env.E2E_CLIP_B ?? path.join(process.cwd(), "public/samples/coffee-ocean-b.mp4");
const jar = new Map<string, string>();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
/**
 * When set, every run's full cut, bridge, poster and boundary frames are saved here and a share link is created.
 * session.json keeps the guest cookie and ids, so a run interrupted mid-render can still be fetched afterwards.
 */
const SAVE_DIR = process.env.E2E_SAVE_DIR ?? "";
function remember(state: Record<string, string>) {
  if (!SAVE_DIR) return;
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const file = path.join(SAVE_DIR, "session.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...state, base: BASE, cookie: cookieHeader() }, null, 2), { mode: 0o600 });
}
async function save(url: string | null | undefined, name: string, required = true) {
  const res = url ? await fetch(BASE + url, { headers: { cookie: cookieHeader() } }) : null;
  if (!res?.ok) {
    const why = `could not save ${name}: ${res ? res.status : "the API returned no URL"}`;
    if (required) fail(why);
    console.warn(why);
    return;
  }
  fs.writeFileSync(path.join(SAVE_DIR, name), Buffer.from(await res.arrayBuffer()));
}
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const fail = (m: string): never => { console.error(`E2E FAILED: ${m}`); process.exit(1); };

async function call(pathname: string, init: RequestInit = {}): Promise<{ status: number; body: any; res: Response }> {
  const res = await fetch(BASE + pathname, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieHeader() }, redirect: "manual" });
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

/**
 * A phone-sized clip. The proxy in front of /api once buffered request bodies and cut them at 10 MB, so real clips
 * failed to parse as form data while the small samples above passed.
 */
async function largeUpload() {
  const file = path.join(os.tmpdir(), `seam-e2e-large-${process.pid}.mp4`);
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-t", "6",
    "-c:v", "libx264", "-b:v", "22M", "-maxrate", "22M", "-bufsize", "44M", "-pix_fmt", "yuv420p", file]);
  const bytes = fs.statSync(file).size;
  if (bytes < 12 * 1024 * 1024) fail(`large upload fixture is only ${bytes} bytes`);
  try {
    const r = await upload("start", file);
    log(`large upload ok: ${(bytes / 1e6).toFixed(1)} MB clip → project ${r.project.id}, ${r.asset.kind} ${r.asset.durationSec}s`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const logAttempts = (gen: any) => {
  for (const a of gen.attemptLog ?? []) log(`   attempt ${a.n} ${a.modelId} → ${a.status}${a.quality != null ? ` quality ${a.quality}` : ""} in ${Math.round((a.durationMs ?? 0) / 1000)}s${a.error ? ` :: ${String(a.error).slice(0, 160)}` : ""}`);
};

/**
 * A fan-out sibling keeps rendering after its run is ready. When it lands the run must still read ready and its share
 * page must still load: on 2026-09-16 a late DoP Lite take put a ready Kling preview back to "Checking the result".
 */
async function checkAfterSiblings(finished: { run: number; genId: string; shareUrl: string | null }[]) {
  const deadline = Date.now() + Number(process.env.E2E_SIBLING_TIMEOUT_MS ?? 15 * 60_000);
  for (const f of finished) {
    let gen: any = null;
    for (;;) {
      gen = (await call(`/api/generations/${f.genId}`)).body?.generation;
      if (!(gen?.attemptLog ?? []).some((a: any) => a.status === "running")) break;
      if (Date.now() > deadline) fail(`run ${f.run}: a fan-out attempt was still rendering at the timeout`);
      await sleep(5000);
    }
    log(`run ${f.run} after every attempt settled: ${gen?.status} (${gen?.stageLabel})`);
    logAttempts(gen);
    if (gen?.status !== "ready") fail(`run ${f.run} was ready, then became ${gen?.status} once its fan-out siblings finished`);
    if (f.shareUrl) {
      // No cookie: the page is for people who are not signed in. Fetched from the server under test, whatever origin the link names.
      const page = await fetch(BASE + new URL(f.shareUrl).pathname);
      if (page.status !== 200) fail(`share page ${f.shareUrl} returned ${page.status}`);
      log(`   share page loads for a signed-out visitor: ${f.shareUrl}`);
    }
  }
}

async function main() {
  log(`base ${BASE}`);
  const runtime = await call("/api/runtime");
  log(`runtime: ${JSON.stringify(runtime.body)}`);
  const a = await upload("start", A);
  const projectId = a.project.id;
  remember({ projectId });
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
  await largeUpload();
  log(`credits before runs: ${view.credits}`);
  const RUN_COST = Number(process.env.E2E_RUN_COST ?? 2);
  if (view.credits !== FREE_RUNS * RUN_COST) fail(`fresh guest should have ${FREE_RUNS} free runs (${FREE_RUNS * RUN_COST} credits), has ${view.credits}`);

  const finished: { run: number; genId: string; shareUrl: string | null }[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const g = await call(`/api/projects/${projectId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(process.env.E2E_INTENT ? { intent: process.env.E2E_INTENT } : {}) });
    if (g.status !== 200) fail(`generate run ${run}: ${g.status} ${JSON.stringify(g.body).slice(0, 200)}`);
    const genId = g.body.generation.id;
    remember({ [`run${run}GenerationId`]: genId });
    let gen: any = null;
    // Video-model queues vary from 3 to 15 minutes; allow 20 before calling a run stuck.
    const RUN_TIMEOUT_MS = Number(process.env.E2E_RUN_TIMEOUT_MS ?? 20 * 60_000);
    const t1 = Date.now();
    while (Date.now() - t1 < RUN_TIMEOUT_MS) {
      await sleep(2000);
      gen = (await call(`/api/generations/${genId}`)).body?.generation;
      if (gen?.status === "ready" || gen?.status === "failed") break;
    }
    if (gen?.status !== "ready") fail(`run ${run} ended ${gen?.status}: ${gen?.friendlyError ?? gen?.stageLabel}`);
    const media = await fetch(BASE + gen.result.fullUrl, { headers: { cookie: cookieHeader() } });
    const full = Buffer.from(await media.arrayBuffer());
    const bytes = full.byteLength;
    if (!media.ok || bytes < 50_000) fail(`run ${run} result not downloadable (${media.status}, ${bytes} bytes)`);
    if (!(gen.result.bridgeDurationSec > 0)) fail(`run ${run} has no bridge`);
    log(`run ${run} ready: ${gen.result.providerId}/${gen.result.modelLabel}, bridge ${gen.result.bridgeDurationSec}s, full ${gen.result.fullDurationSec}s, ${(bytes / 1e6).toFixed(1)} MB, quality ${gen.result.quality?.overall ?? "n/a"}, attempts ${gen.result.attempts}`);
    let shareUrl: string | null = null;
    if (SAVE_DIR) {
      fs.writeFileSync(path.join(SAVE_DIR, `run${run}_full.mp4`), full);
      await save(gen.result.bridgeUrl, `run${run}_bridge.mp4`);
      await save(gen.result.posterUrl, `run${run}_poster.jpg`, false);
      if (run === 1) { await save(bd.startFrameUrl, "frame_a.jpg"); await save(bd.endFrameUrl, "frame_b.jpg"); }
      const share = await call("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: genId }) });
      if (share.status === 200) { shareUrl = share.body.url; remember({ [`run${run}ShareUrl`]: share.body.url }); }
      log(`   saved to ${SAVE_DIR}${share.status === 200 ? `; share link ${share.body.url}` : `; share failed ${share.status} ${JSON.stringify(share.body).slice(0, 120)}`}`);
    }
    logAttempts(gen);
    finished.push({ run, genId, shareUrl });
  }
  await checkAfterSiblings(finished);
  if (RUNS < FREE_RUNS) { log(`stopped after ${RUNS} run(s); paywall not tested`); console.log("E2E PASSED"); return; }
  const blocked = await call(`/api/projects/${projectId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (blocked.status !== 402 || blocked.body?.code !== "NO_CREDITS") fail(`run ${FREE_RUNS + 1} should be refused with 402 NO_CREDITS, got ${blocked.status} ${JSON.stringify(blocked.body).slice(0, 120)}`);
  // Guests are not "users" on the account endpoint; the project view carries the balance for both.
  const after = (await call(`/api/projects/${projectId}`)).body;
  if (after?.credits !== 0) fail(`balance should be 0 after the trial, is ${after?.credits}`);
  log(`paywall ok: run ${FREE_RUNS + 1} refused with 402, balance 0`);
  console.log("E2E PASSED");
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
