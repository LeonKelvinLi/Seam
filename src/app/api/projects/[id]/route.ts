import { bad, getUserId, json } from "@/lib/server/session";
import { ownedProject } from "@/lib/server/access";
import { projectView } from "@/lib/server/views";
import { startRunner } from "@/core/pipeline/runner";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ownedProject(id, await getUserId())) return bad("Project not found", 404);
  startRunner();
  const view = projectView(id);
  if (!view) return bad("Project not found", 404);
  return json(view);
}
