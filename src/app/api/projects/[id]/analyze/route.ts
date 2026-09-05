import { bad, getUserId, json } from "@/lib/server/session";
import { Assets, Events, Projects } from "@/db/repo";
import { enqueue } from "@/core/pipeline/runner";
import { latestAnalyzeJob, projectView } from "@/lib/server/views";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const project = Projects.get(id);
  if (!project) return bad("Project not found", 404);
  if (!Assets.byRole(id, "start") || !Assets.byRole(id, "end")) return bad("Upload both clips first.");
  const running = latestAnalyzeJob(id);
  if (running && (running.status === "queued" || running.status === "running")) return json({ jobId: running.id, state: projectView(id) });
  const job = enqueue("analyze", { projectId: id });
  Projects.update(id, { status: "analyzing", analysisError: null });
  Events.track("analysis_started", { userId, projectId: id });
  return json({ jobId: job.id, state: projectView(id) });
}
