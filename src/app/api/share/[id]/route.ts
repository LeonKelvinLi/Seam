import { bad, json } from "@/lib/server/session";
import { sharePayload } from "@/lib/server/share";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const payload = sharePayload(id, true);
  if (!payload) return bad("Not found", 404);
  return json(payload);
}
