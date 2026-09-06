import { bad, getUserId, json } from "@/lib/server/session";
import { Events, Learning, Shares } from "@/db/repo";
import { config } from "@/core/config";
import { ownedGeneration } from "@/lib/server/access";

export async function POST(req: Request) {
  const userId = await getUserId();
  const { generationId } = (await req.json().catch(() => ({}))) as { generationId?: string };
  const g = generationId ? ownedGeneration(generationId, userId) : undefined;
  if (!g) return bad("Generation not found", 404);
  if (g.status !== "ready") return bad("Nothing to share yet.");
  const share = Shares.create(g.id);
  Learning.flag(g.id, "userShared");
  Events.track("shared", { userId, projectId: g.projectId, generationId: g.id, props: { shareId: share.id } });
  const origin = config.publicUrl || new URL(req.url).origin;
  return json({ id: share.id, url: `${origin}/t/${share.id}` });
}
