import { Assets, Generations, Shares } from "@/db/repo";
import { assetView, generationView } from "@/lib/server/views";

export function sharePayload(shareId: string, bump = false) {
  const share = Shares.get(shareId);
  if (!share) return null;
  const g = Generations.get(share.generationId);
  if (!g || g.status !== "ready") return null;
  if (bump) Shares.bump(shareId);
  const sharedUrl = (url: string | null) => url ? `${url}?share=${encodeURIComponent(share.id)}` : null;
  const generation = generationView(g);
  if (generation.result) {
    generation.result.fullUrl = sharedUrl(generation.result.fullUrl);
    generation.result.bridgeUrl = sharedUrl(generation.result.bridgeUrl);
    generation.result.posterUrl = sharedUrl(generation.result.posterUrl);
  }
  const sharedAsset = (role: "start" | "end") => {
    const asset = assetView(Assets.byRole(g.projectId, role));
    return asset ? { ...asset, thumbnailUrl: sharedUrl(asset.thumbnailUrl), previewUrl: sharedUrl(asset.previewUrl) } : null;
  };
  return {
    id: share.id,
    generation,
    start: sharedAsset("start"),
    end: sharedAsset("end"),
    views: share.views + (bump ? 1 : 0),
  };
}
