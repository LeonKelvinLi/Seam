import { RECIPES, RECIPE_MAP } from "./catalog";
import type { LibraryTag, TransitionClass, TransitionRecipe } from "./types";

export { RECIPES };

export function getRecipe(id: string): TransitionRecipe {
  const r = RECIPE_MAP[id];
  if (!r) throw new Error(`Unknown recipe: ${id}`);
  return r;
}

export function hasRecipe(id: string): boolean {
  return !!RECIPE_MAP[id];
}

export function recipesByCategory(category: TransitionClass): TransitionRecipe[] {
  return RECIPES.filter((r) => r.category === category);
}

export function recipesByTag(tag: LibraryTag): TransitionRecipe[] {
  return RECIPES.filter((r) => r.tags.includes(tag));
}

export const LIBRARY_CATEGORIES: { tag: LibraryTag; label: string; emoji: string }[] = [
  { tag: "viral", label: "Viral", emoji: "🔥" },
  { tag: "cinematic", label: "Cinematic", emoji: "🎥" },
  { tag: "smooth", label: "Smooth", emoji: "✨" },
  { tag: "insane", label: "Insane", emoji: "🤯" },
  { tag: "cars", label: "Cars", emoji: "🚗" },
  { tag: "travel", label: "Travel", emoji: "✈️" },
  { tag: "fashion", label: "Fashion", emoji: "👗" },
  { tag: "food", label: "Food", emoji: "🍜" },
  { tag: "realestate", label: "Real Estate", emoji: "🏠" },
  { tag: "products", label: "Products", emoji: "📱" },
  { tag: "music", label: "Music", emoji: "🎵" },
];

/** Compact catalogue summary handed to the vision model so it can propose recipe ids. */
export function catalogSummary(): string {
  return RECIPES.map((r) => `${r.id}: ${r.name} — ${r.description}`).join("\n");
}

/** Public, UI-safe projection of a recipe. */
export function publicRecipe(r: TransitionRecipe) {
  return {
    id: r.id, name: r.name, category: r.category, tags: r.tags, description: r.description,
    intensity: r.intensity, wow: r.wow, recommendedDuration: r.recommendedDuration, local: r.local,
  };
}
