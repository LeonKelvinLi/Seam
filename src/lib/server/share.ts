import { Assets, Generations, Shares } from "@/db/repo";
import { assetView, generationView } from "@/lib/server/views";

export function sharePayload(shareId: string, bump = false) {
  const share = Shares.get(shareId);
  if (!share) return null;
  const g = Generations.get(share.generationId);
  if (!g || g.status !== "ready") return null;
  if (bump) Shares.bump(shareId);
  return {
    id: share.id,
    generation: generationView(g),
    start: assetView(Assets.byRole(g.projectId, "start")),
    end: assetView(Assets.byRole(g.projectId, "end")),
    views: share.views + (bump ? 1 : 0),
  };
}
