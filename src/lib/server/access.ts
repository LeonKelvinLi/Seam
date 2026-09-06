import { db } from "@/db/client";
import { Assets, Generations, Projects, Shares } from "@/db/repo";

export function ownedProject(id: string, userId: string) {
  const project = Projects.get(id);
  return project?.userId === userId ? project : undefined;
}

export function ownedGeneration(id: string, userId: string) {
  const generation = Generations.get(id);
  return generation && ownedProject(generation.projectId, userId) ? generation : undefined;
}

/** Only registered project media is readable; arbitrary files in dataDir are never served. */
export function canReadMedia(abs: string, userId: string, shareId: string | null): boolean {
  const owned = db().prepare(`
    SELECT 1 FROM projects p WHERE p.userId = ? AND p.id IN (
      SELECT projectId FROM assets WHERE ? IN (path, proxyPath, thumbnailPath)
      UNION SELECT a.projectId FROM frames f JOIN assets a ON a.id = f.assetId WHERE f.path = ?
      UNION SELECT projectId FROM generations WHERE status = 'ready' AND ? IN (
        json_extract(result, '$.fullPath'), json_extract(result, '$.bridgePath'), json_extract(result, '$.posterPath')
      )
    ) LIMIT 1
  `).get(userId, abs, abs, abs);
  if (owned) return true;
  const share = shareId ? Shares.get(shareId) : undefined;
  const generation = share ? Generations.get(share.generationId) : undefined;
  if (!generation || generation.status !== "ready" || !generation.result) return false;
  const result = generation.result;
  if ([result.fullPath, result.bridgePath, result.posterPath].includes(abs)) return true;
  return Assets.forProject(generation.projectId).some((asset) => [asset.path, asset.proxyPath, asset.thumbnailPath].includes(abs));
}
