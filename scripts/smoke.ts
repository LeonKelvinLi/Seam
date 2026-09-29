/**
 * Headless end-to-end run of the pipeline on a sample pair:
 * ingest -> analyze -> recommend -> generate (surprise) -> judge -> stitch. Prints where the output landed.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { Generations, Projects, Users } from "@/db/repo";
import { ingestFile } from "@/lib/server/ingest";
import { enqueue, startRunner, waitForJob } from "@/core/pipeline/runner";
import { createGeneration } from "@/lib/server/generate";
import { projectView } from "@/lib/server/views";
import { describeRuntime } from "@/core/config";

async function main() {
  // A sample pair name, or two clip paths joined by a comma ("a.mp4,b.mp4").
  const pair = process.argv[2] ?? "coffee-ocean";
  const dir = path.join(process.cwd(), "public", "samples");
  const [a, b] = pair.includes(",") ? pair.split(",").map((p) => path.resolve(p)) : [path.join(dir, `${pair}-a.mp4`), path.join(dir, `${pair}-b.mp4`)];
  if (!fs.existsSync(a)) throw new Error(`missing ${a}; run npm run samples`);
  console.log("runtime:", describeRuntime());
  const user = Users.ensure("usr_smoke0000000");
  const project = Projects.create(user.id, `smoke ${pair}`);
  await ingestFile({ projectId: project.id, userId: user.id, role: "start", buffer: fs.readFileSync(a), originalName: path.basename(a), mime: "video/mp4" });
  await ingestFile({ projectId: project.id, userId: user.id, role: "end", buffer: fs.readFileSync(b), originalName: path.basename(b), mime: "video/mp4" });
  startRunner();
  const t0 = Date.now();
  const job = await waitForJob(enqueue("analyze", { projectId: project.id }).id);
  if (job.status !== "done") throw new Error(`analysis failed: ${job.error}`);
  const view = projectView(project.id)!;
  console.log(`analysis ${Date.now() - t0}ms · analyzer=${view.boundary?.analyzer} · cut A@${view.boundary?.cutA.toFixed(2)}s B@${view.boundary?.cutB.toFixed(2)}s`);
  for (const r of view.recommendations) if (r) console.log(`  ${r.lane.padEnd(9)} ${r.opportunity.title} — ${r.opportunity.why} [${r.opportunity.overall}]`);
  const gen = createGeneration({ projectId: project.id, userId: user.id, intent: (process.argv[3] as never) ?? "surprise" });
  const t1 = Date.now();
  const gj = await waitForJob(gen.jobId!);
  const g = Generations.get(gen.id)!;
  if (gj.status !== "done" || !g.result) throw new Error(`generation failed: ${gj.error}`);
  console.log(`generation ${Date.now() - t1}ms · recipe=${g.recipeId} · model=${g.result.modelId} · quality=${g.result.quality?.overall} · attempts=${g.result.attempts}`);
  console.log("full edit:", g.result.fullPath);
  console.log("bridge:   ", g.result.bridgePath);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
