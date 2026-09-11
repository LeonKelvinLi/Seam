/**
 * Four lanes + Surprise Me (spec §7, §8). Internally scores stay hidden; each lane gets the
 * best-fitting opportunity and we avoid showing the same recipe twice when alternatives exist.
 */
import type { Intent, TransitionOpportunity } from "@/core/types";
import { getRecipe } from "@/core/recipes/registry";

type Opp = Pick<TransitionOpportunity, "recipeId" | "scores">;

const laneScore: Record<Intent, (o: Opp) => number> = {
  smooth: (o) => o.scores.overall * 0.55 + (100 - o.scores.artifactRisk) * 0.3 + o.scores.visualContinuity * 0.15,
  cinematic: (o) => o.scores.overall * 0.5 + o.scores.geometryMatch * 0.2 + o.scores.motionCompatibility * 0.2 + (100 - o.scores.artifactRisk) * 0.1,
  viral: (o) => o.scores.overall * 0.55 + o.scores.wow * 0.45,
  insane: (o) => o.scores.wow * 0.5 + o.scores.overall * 0.4 + o.scores.semanticMatch * 0.1,
  surprise: (o) => {
    const r = getRecipe(o.recipeId);
    const shortForm = r.recommendedDuration[1] <= 2.0 ? 10 : 0;
    return o.scores.overall * 0.45 + o.scores.wow * 0.3 + (100 - o.scores.artifactRisk) * 0.15 + shortForm;
  },
};

const laneFilter: Record<Intent, (intensity: number, category: string) => boolean> = {
  smooth: (i) => i <= 0.45,
  cinematic: (i, c) => i >= 0.3 && i <= 0.75 && c !== "surreal",
  viral: (i, c) => c === "transformation" || c === "portal" || c === "surreal" || i >= 0.5,
  insane: (i) => i >= 0.72,
  surprise: () => true,
};

/** Every lane is a seamless bridge; they differ in how much the world is allowed to change. */
export const LANE_ORDER: Intent[] = ["smooth", "cinematic", "viral", "surprise"];

export const LANE_COPY: Record<Intent, { label: string; blurb: string }> = {
  smooth: { label: "Invisible", blurb: "The cut you cannot see." },
  cinematic: { label: "Cinematic", blurb: "One continuous camera move between the shots." },
  viral: { label: "Transformation", blurb: "One shot becomes the other." },
  insane: { label: "Transformation", blurb: "One shot becomes the other." },
  surprise: { label: "Surprise Me", blurb: "The strongest seamless idea in your footage." },
};

export function recommend<T extends Opp>(opps: T[]): { lane: Intent; opportunity: T }[] {
  const used = new Set<string>();
  const out: { lane: Intent; opportunity: T }[] = [];
  for (const lane of LANE_ORDER) {
    const filtered = opps.filter((o) => { const r = getRecipe(o.recipeId); return laneFilter[lane](r.intensity, r.category); });
    const pool = (filtered.length ? filtered : opps).slice().sort((x, y) => laneScore[lane](y) - laneScore[lane](x));
    const pick = pool.find((o) => !used.has(o.recipeId)) ?? pool[0];
    if (!pick) continue;
    if (lane !== "surprise") used.add(pick.recipeId);
    out.push({ lane, opportunity: pick });
  }
  return out;
}

/** "Make Wilder" / "Make Smoother": step intensity and pick the best opportunity in that band. */
export function stepIntent<T extends Opp>(opps: T[], current: T, direction: "wilder" | "smoother"): T {
  const cur = getRecipe(current.recipeId).intensity;
  const band = opps.filter((o) => {
    const i = getRecipe(o.recipeId).intensity;
    return direction === "wilder" ? i > cur + 0.12 : i < cur - 0.12;
  });
  const key = direction === "wilder" ? laneScore.viral : laneScore.smooth;
  const pick = band.sort((x, y) => key(y) - key(x))[0];
  return pick ?? current;
}
