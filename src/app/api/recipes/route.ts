import fs from "node:fs";
import path from "node:path";
import { json } from "@/lib/server/session";
import { LIBRARY_CATEGORIES, RECIPES, publicRecipe } from "@/core/recipes/registry";

export async function GET() {
  // Only real AI bridges may be shown as previews. The old `public/library` clips were ffmpeg effects
  // rendered on a sample still, which is exactly what SeamCut does not sell.
  const dir = path.join(process.cwd(), "public", "library-ai");
  const previews = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp4")).map((f) => f.replace(/\.mp4$/, "")) : []);
  return json({
    categories: LIBRARY_CATEGORIES,
    recipes: RECIPES.map((r) => ({ ...publicRecipe(r), previewUrl: previews.has(r.id) ? `/library-ai/${r.id}.mp4` : null })),
  });
}
