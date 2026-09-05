/**
 * Local procedural provider. Builds a bridge from the two boundary frames with ffmpeg
 * (zoom/pan + xfade curves). Always available: it is the "preview" tier and the safety net.
 * Start/end fidelity is perfect by construction, so the judge never rejects it.
 */
import { stillWithMove, xfadeClips } from "@/core/media/ffmpeg";
import { storage } from "@/core/media/storage";
import type { ModelSpec, TransitionProvider, TransitionRequest, TransitionResult } from "./types";

interface Move { zoomFrom: number; zoomTo: number; fx: number; fy: number; panX?: number; panY?: number }

function moves(kind: string, fa: { x: number; y: number }, fb: { x: number; y: number }, strength: number): { a: Move; b: Move; blur: number } {
  const z = 1 + 0.5 * (0.6 + strength * 0.8); // zoom amplitude scales with motion strength
  switch (kind) {
    case "zoom-in": return { a: { zoomFrom: 1, zoomTo: z, fx: fa.x, fy: fa.y }, b: { zoomFrom: z, zoomTo: 1, fx: fb.x, fy: fb.y }, blur: 0 };
    case "zoom-out": return { a: { zoomFrom: z, zoomTo: 1, fx: 0.5, fy: 0.5 }, b: { zoomFrom: z * 1.1, zoomTo: 1, fx: 0.5, fy: 0.5 }, blur: 0 };
    case "whip-left": return { a: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0, fy: 0.5, panX: 1 }, b: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0, fy: 0.5, panX: 1 }, blur: 0 };
    case "whip-right": return { a: { zoomFrom: 1.25, zoomTo: 1.25, fx: 1, fy: 0.5, panX: -1 }, b: { zoomFrom: 1.25, zoomTo: 1.25, fx: 1, fy: 0.5, panX: -1 }, blur: 0 };
    case "whip-up": return { a: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0.5, fy: 1, panY: -1 }, b: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0.5, fy: 1, panY: -1 }, blur: 0 };
    case "whip-down": return { a: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0.5, fy: 0, panY: 1 }, b: { zoomFrom: 1.25, zoomTo: 1.25, fx: 0.5, fy: 0, panY: 1 }, blur: 0 };
    case "spin": return { a: { zoomFrom: 1, zoomTo: z, fx: 0.5, fy: 0.5 }, b: { zoomFrom: z, zoomTo: 1, fx: 0.5, fy: 0.5 }, blur: 0 };
    case "circle": case "radial": return { a: { zoomFrom: 1, zoomTo: 1 + (z - 1) * 0.6, fx: fa.x, fy: fa.y }, b: { zoomFrom: 1 + (z - 1) * 0.6, zoomTo: 1, fx: fb.x, fy: fb.y }, blur: 0 };
    case "flash": case "blur": return { a: { zoomFrom: 1, zoomTo: 1.18, fx: fa.x, fy: fa.y }, b: { zoomFrom: 1.18, zoomTo: 1, fx: fb.x, fy: fb.y }, blur: 0 };
    case "squeeze": case "pixel": return { a: { zoomFrom: 1, zoomTo: 1.1, fx: 0.5, fy: 0.5 }, b: { zoomFrom: 1.1, zoomTo: 1, fx: 0.5, fy: 0.5 }, blur: 0 };
    default: return { a: { zoomFrom: 1, zoomTo: 1.08, fx: fa.x, fy: fa.y }, b: { zoomFrom: 1.08, zoomTo: 1, fx: fb.x, fy: fb.y }, blur: 0 };
  }
}

export const LOCAL_MODEL: ModelSpec = {
  id: "local:xfade", providerId: "local", endpoint: "ffmpeg", label: "Procedural preview (ffmpeg)",
  supportsLastFrame: true, durations: [], costPerSecondUsd: 0, tier: "preview",
  strengths: { fpv: 0.15, morph: 0.1, human: 0.2, environment: 0.15, product: 0.2, generic: 0.3 },
  dialect: "generic", latencyEstimateSec: 5,
};

export const localProvider: TransitionProvider = {
  id: "local",
  name: "Local (ffmpeg)",
  models: [LOCAL_MODEL],
  isAvailable: () => true,
  async generateTransition(req: TransitionRequest): Promise<TransitionResult> {
    const { spec, recipe, focusA, focusB } = req.local;
    const dir = storage.ensureDir(req.outputPath.replace(/[^/]+$/, ""));
    const { a, b, blur } = moves(recipe.local.kind, focusA, focusB, req.motionStrength);
    const target = recipe.local.target ?? "focus";
    if (target === "center") { a.fx = 0.5; a.fy = 0.5; b.fx = 0.5; b.fy = 0.5; }
    req.onProgress?.("Rendering the camera move");
    const clipA = `${dir}/local_a.mp4`, clipB = `${dir}/local_b.mp4`;
    await stillWithMove(req.firstFramePath, clipA, spec, req.durationSec, a);
    await stillWithMove(req.lastFramePath, clipB, spec, req.durationSec, b);
    await xfadeClips(clipA, clipB, req.outputPath, spec, recipe.local.xfade, req.durationSec, blur);
    return {
      outputPath: req.outputPath, providerJobId: null, rawDurationSec: req.durationSec, costUsd: 0,
      params: { kind: recipe.local.kind, xfade: recipe.local.xfade, zoomA: a, zoomB: b },
    };
  },
};
