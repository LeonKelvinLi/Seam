import { Generations } from "@/db/repo";
import { ownedGeneration } from "./access";
import { mediaUrl } from "@/core/media/storage";
import { getRecipe } from "@/core/recipes/registry";

const PAGE_SIZE = 24;

export function generationHistory(userId: string, cursor: string | null = null) {
  const before = cursor ? ownedGeneration(cursor, userId) : undefined;
  if (cursor && !before) throw new Error("Invalid history cursor");
  const rows = Generations.completedForUser(userId, before, PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    generations: page.map((g) => ({
      id: g.id, projectId: g.projectId, title: getRecipe(g.recipeId).name, createdAt: g.createdAt, mode: g.mode,
      fullUrl: mediaUrl(g.result!.fullPath), bridgeUrl: mediaUrl(g.result!.bridgePath), posterUrl: mediaUrl(g.result!.posterPath),
      fullDurationSec: g.result!.fullDurationSec, bridgeDurationSec: g.result!.bridgeDurationSec,
    })),
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
  };
}

export type HistoryPage = ReturnType<typeof generationHistory> & { isGuest: boolean };
