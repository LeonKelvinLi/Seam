/**
 * Proof run for the library: push one effect through the real pipeline (vision analysis, fit check, prompt compiler,
 * model router, judge, retries, stitch) on a designed start/end pair, and keep what the product actually produced.
 *
 *   SEAM_FORCE_PROVIDER= SEAM_DATA_DIR=/tmp/seam-proof npx tsx scripts/proof-previews.ts <recipeId> <start> <end> [outDir]
 *
 * Add SEAM_FORCE_MODEL=<model id> (for example higgsfield:veo3.1-fast-flf) to prove one model instead of the router's pick.
 * Start and end may be stills or clips. Uses the provider keys in .env.local, so every run spends real provider credit.
 * Exit codes: 0 produced, 2 the pair is a poor fit (the product would refuse it), 3 every AI attempt failed.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { Generations, Opportunities, Projects, Users } from "@/db/repo";
import { ingestFile } from "@/lib/server/ingest";
import { enqueue, startRunner, waitForJob } from "@/core/pipeline/runner";
import { createGeneration } from "@/lib/server/generate";
import { generationView } from "@/lib/server/views";
import { config, describeRuntime } from "@/core/config";

const mimeFor = (f: string) => (/\.png$/i.test(f) ? "image/png" : /\.jpe?g$/i.test(f) ? "image/jpeg" : /\.webp$/i.test(f) ? "image/webp" : "video/mp4");

async function main() {
  const [recipeId, startPath, endPath, outDir = "proof"] = process.argv.slice(2);
  if (!recipeId || !startPath || !endPath) throw new Error("usage: proof-previews.ts <recipeId> <start> <end> [outDir]");
  const runtime = describeRuntime();
  if (runtime.forcedProvider) throw new Error(`SEAM_FORCE_PROVIDER=${runtime.forcedProvider} would skip the real models; run with SEAM_FORCE_PROVIDER= (empty)`);
  const only = config.providers.forceModel;
  if (only) console.log(`routing every attempt to ${only}`);
  const user = Users.ensure("usr_proof0000000");
  Users.grant(user.id, 20);
  const project = Projects.create(user.id, `proof ${recipeId}`);
  for (const [role, file] of [["start", startPath], ["end", endPath]] as const) {
    await ingestFile({ projectId: project.id, userId: user.id, role, buffer: fs.readFileSync(file), originalName: path.basename(file), mime: mimeFor(file) });
  }
  startRunner();
  const analysis = await waitForJob(enqueue("analyze", { projectId: project.id }).id);
  if (analysis.status !== "done") throw new Error(`analysis failed: ${analysis.error}`);

  const opp = Opportunities.forProject(project.id).find((o) => o.recipeId === recipeId);
  console.log(`${recipeId}: fit ${opp?.hints.fit ?? "unscored"}${opp?.hints.fitNeeds ? ` (${opp.hints.fitNeeds})` : ""}, score ${opp?.scores.overall ?? "-"}`);
  if (opp?.hints.fit === "poor") { console.log("POOR FIT: the product would refuse this pair"); process.exit(2); }

  const gen = createGeneration({ projectId: project.id, userId: user.id, recipeId });
  const job = await waitForJob(gen.jobId!);
  const g = Generations.get(gen.id)!;
  for (const a of generationView(g).attemptLog) {
    console.log(`  attempt ${a.n} ${a.modelId} -> ${a.status}${a.quality != null ? ` quality ${a.quality}` : ""} in ${Math.round((a.durationMs ?? 0) / 1000)}s, ~$${(a.costUsd ?? 0).toFixed(2)}${a.error ? ` :: ${String(a.error).slice(0, 160)}` : ""}`);
  }
  if (job.status !== "done" || !g.result) { console.log(`FAILED: ${g.friendlyError ?? job.error}`); process.exit(3); }
  fs.mkdirSync(outDir, { recursive: true });
  const tag = only ? `${recipeId}.${only.replace(/[^a-z0-9.-]+/gi, "_")}` : recipeId;
  fs.copyFileSync(g.result.bridgePath, path.join(outDir, `${tag}.bridge.mp4`));
  fs.copyFileSync(g.result.fullPath, path.join(outDir, `${tag}.full.mp4`));
  console.log(`OK ${recipeId}: ${g.result.modelId}, quality ${g.result.quality?.overall}, attempts ${g.result.attempts}, bridge ${g.result.bridgeDurationSec}s, full ${g.result.fullDurationSec.toFixed(2)}s -> ${outDir}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
