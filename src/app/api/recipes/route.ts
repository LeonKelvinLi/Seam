import fs from "node:fs";
import path from "node:path";
import { json } from "@/lib/server/session";
import { LIBRARY_CATEGORIES, RECIPES, publicRecipe } from "@/core/recipes/registry";

/**
 * Real AI bridges from the example set that show a style exactly: each was checked frame by frame against the
 * style's description (a door opening onto a beach is a Door Portal; steam clearing onto fog is a Smoke Transformation).
 * A dedicated preview in `public/library-ai/<id>.mp4` always wins over these.
 */
const EXAMPLE_PREVIEWS: Record<string, string> = {
  "liquid-transform": "coffee-ocean",
  "shape-match": "wheel-tunnel",
  "push-through": "eye-space",
  "portal-phone": "phone-city",
  "portal-door": "door-beach",
  "portal-window": "window-clouds",
  "smoke-transform": "steam-fog",
  "portal-mirror": "mirror-outfit",
};

function previewFor(id: string, dedicated: Set<string>): string | null {
  if (dedicated.has(id)) return `/library-ai/${id}.mp4`;
  const example = EXAMPLE_PREVIEWS[id];
  return example ? `/examples/${example}/bridge.mp4` : null;
}

export async function GET() {
  // Only real AI bridges may be shown as previews. The old `public/library` clips were ffmpeg effects
  // rendered on a sample still, which is exactly what SeamCut does not sell.
  const dir = path.join(process.cwd(), "public", "library-ai");
  const previews = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp4")).map((f) => f.replace(/\.mp4$/, "")) : []);
  return json({
    categories: LIBRARY_CATEGORIES,
    recipes: RECIPES.map((r) => ({ ...publicRecipe(r), previewUrl: previewFor(r.id, previews) })),
  });
}
