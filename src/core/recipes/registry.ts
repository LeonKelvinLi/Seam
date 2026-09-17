import { RECIPES as CATALOG, RECIPE_MAP } from "./catalog";
import type { LibraryTag, TransitionClass, TransitionRecipe } from "./types";

/**
 * Clipmelt offers seamless transitions only: AI bridges whose seam you are not meant to see.
 * Effect moves (crash zoom, whip pan, spin, tunnel rush, drone dive, explosions) and the plain
 * dissolve/cut stay in the catalog so older generations still resolve by id, but they are never
 * recommended, listed in the library, or offered to the vision model as an idea.
 */
export const SEAMLESS_RECIPE_IDS: ReadonlySet<string> = new Set([
  // Continuous camera moves that carry the eye through the cut
  "push-through", "dolly-through", "pull-out-reveal", "foreground-pass", "object-occlusion", "orbit",
  // Match cuts: the next shot inherits the frame
  "shape-match", "composition-match", "motion-match", "object-match", "silhouette-match", "color-match",
  // Morphs: one thing becomes the other
  "object-morph", "environment-morph", "material-transform", "liquid-transform", "smoke-transform",
  "fabric-transform", "glass-transform", "object-becomes-environment",
  // Portals: a frame inside the shot opens into the next one
  "portal-door", "portal-window", "portal-phone", "portal-tv", "portal-mirror", "portal-cup", "portal-tunnel", "portal-car-window",
]);

for (const id of SEAMLESS_RECIPE_IDS) {
  if (!RECIPE_MAP[id]) throw new Error(`The seamless list names a recipe that does not exist: ${id}`);
}

/** Everything ever shipped. Only for resolving ids recorded on existing generations. */
export const ALL_RECIPES = CATALOG;

/** What we recommend, list, and let the vision model choose from. */
export const RECIPES = CATALOG.filter((r) => SEAMLESS_RECIPE_IDS.has(r.id));

/** Used when a recipe's safer alternative is itself not seamless. */
export const SAFE_SEAMLESS_RECIPE_ID = "composition-match";

/** Is this recipe one we still offer? */
export function isOffered(id: string): boolean {
  return SEAMLESS_RECIPE_IDS.has(id);
}

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

export const LIBRARY_CATEGORIES: { tag: LibraryTag; label: string }[] = [
  { tag: "smooth", label: "Invisible" },
  { tag: "cinematic", label: "Cinematic" },
  { tag: "cars", label: "Cars" },
  { tag: "travel", label: "Travel" },
  { tag: "fashion", label: "Fashion" },
  { tag: "food", label: "Food" },
  { tag: "realestate", label: "Real Estate" },
  { tag: "products", label: "Products" },
  { tag: "music", label: "Music" },
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
