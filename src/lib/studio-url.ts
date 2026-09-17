/** Preserve an unsubmitted library choice while clips upload; a result supersedes it. */
export function studioUrl(projectId: string | null, generationId: string | null, pendingRecipe: string | null = null) {
  const q = new URLSearchParams();
  if (projectId) q.set("p", projectId);
  if (generationId) q.set("g", generationId);
  if (!generationId && pendingRecipe) q.set("recipe", pendingRecipe);
  return `/create${q.size ? `?${q}` : ""}`;
}
