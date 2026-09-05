import { bad, json } from "@/lib/server/session";
import { projectView } from "@/lib/server/views";
import { startRunner } from "@/core/pipeline/runner";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  startRunner();
  const view = projectView(id);
  if (!view) return bad("Project not found", 404);
  return json(view);
}
