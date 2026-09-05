import { bad, json } from "@/lib/server/session";
import { Generations } from "@/db/repo";
import { generationView } from "@/lib/server/views";
import { startRunner } from "@/core/pipeline/runner";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  startRunner();
  const g = Generations.get(id);
  if (!g) return bad("Generation not found", 404);
  return json({ generation: generationView(g) });
}
