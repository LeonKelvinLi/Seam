import { bad, getUserId, json } from "@/lib/server/session";
import { createGeneration } from "@/lib/server/generate";
import { generationView } from "@/lib/server/views";
import { ownedProject } from "@/lib/server/access";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  if (!ownedProject(id, userId)) return bad("Project not found", 404);
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const gen = createGeneration({
      projectId: id, userId,
      intent: body.intent as never, opportunityId: body.opportunityId as string | undefined, recipeId: body.recipeId as string | undefined,
      fineTune: body.fineTune as never, mode: body.mode as never, from: body.from as never,
    });
    return json({ generation: generationView(gen) });
  } catch (e) {
    return bad((e as Error).message, 422);
  }
}
