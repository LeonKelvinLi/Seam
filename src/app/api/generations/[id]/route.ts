import { bad, getUserId, json } from "@/lib/server/session";
import { ownedGeneration } from "@/lib/server/access";
import { generationView } from "@/lib/server/views";
import { startRunner } from "@/core/pipeline/runner";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = ownedGeneration(id, await getUserId());
  if (!g) return bad("Generation not found", 404);
  startRunner();
  return json({ generation: generationView(g) });
}
