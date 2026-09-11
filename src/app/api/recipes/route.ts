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

/**
 * A style's preview and the still shown before it plays. The library loads 28 videos at once, and a card whose video
 * has not drawn its first frame yet would otherwise sit blank, so every card gets that first frame as a poster:
 * `<id>.jpg` beside a dedicated clip, or the example's frame_a (the bridge starts on it).
 */
function previewFor(id: string, dedicated: Set<string>, posters: Set<string>): { previewUrl: string | null; previewPoster: string | null } {
  if (dedicated.has(id)) return { previewUrl: `/library-ai/${id}.mp4`, previewPoster: posters.has(id) ? `/library-ai/${id}.jpg` : null };
  const example = EXAMPLE_PREVIEWS[id];
  return example
    ? { previewUrl: `/examples/${example}/bridge.mp4`, previewPoster: `/examples/${example}/frame_a.jpg` }
    : { previewUrl: null, previewPoster: null };
}

export async function GET() {
  // Only real AI bridges may be shown as previews. The old `public/library` clips were ffmpeg effects
  // rendered on a sample still, which is exactly what SeamCut does not sell.
  const dir = path.join(process.cwd(), "public", "library-ai");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const previews = new Set(files.filter((f) => f.endsWith(".mp4")).map((f) => f.replace(/\.mp4$/, "")));
  const posters = new Set(files.filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, "")));
  return json({
    categories: LIBRARY_CATEGORIES,
    recipes: RECIPES.map((r) => ({ ...publicRecipe(r), ...previewFor(r.id, previews, posters) })),
  });
}
