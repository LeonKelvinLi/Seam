/**
 * Model-free analyzer. Produces the same FrameAnalysis / PairAnalysis shapes from pixel statistics,
 * so the rest of the pipeline works with no API key (with less semantic insight).
 */
import type { FrameAnalysis, FrameFeatures, PairAnalysis } from "@/core/types";
import { colorSimilarity } from "./features";

function temperature(hexes: string[]): "warm" | "neutral" | "cool" {
  let warm = 0;
  for (const h of hexes) {
    const r = parseInt(h.slice(1, 3), 16), b = parseInt(h.slice(5, 7), 16);
    warm += r - b;
  }
  const avg = hexes.length ? warm / hexes.length : 0;
  return avg > 25 ? "warm" : avg < -25 ? "cool" : "neutral";
}

export function heuristicFrame(f: FrameFeatures, next?: FrameFeatures): FrameAnalysis {
  const loc = f.focus.x < 0.36 ? "left" : f.focus.x > 0.64 ? "right" : "center";
  const bright = f.brightness > 0.62 ? "bright" : f.brightness < 0.28 ? "dark" : "evenly lit";
  const temp = temperature(f.dominantColors);
  const detail = f.edgeDensity > 0.25 ? "dense detail" : f.edgeDensity > 0.1 ? "moderate detail" : "soft, open surfaces";
  let camera: FrameAnalysis["motion"]["camera"] = "static";
  if (Math.abs(f.driftX) > 0.012) camera = f.driftX > 0 ? "pan-left" : "pan-right";
  else if (Math.abs(f.driftY) > 0.012) camera = f.driftY > 0 ? "tilt-up" : "tilt-down";
  else if (f.motion > 0.35) camera = "handheld";
  const speed: FrameAnalysis["motion"]["speed"] = f.motion < 0.08 ? "none" : f.motion < 0.25 ? "slow" : f.motion < 0.5 ? "medium" : "fast";
  const occl = next ? Math.max(0, next.uniformCoverage - f.uniformCoverage) * 2 : 0;
  return {
    description: `A ${bright}, ${temp} frame with ${detail}; the visual interest sits ${loc === "center" ? "in the centre" : `on the ${loc}`}.`,
    subjects: [{ label: "main subject", category: "other", prominence: Math.min(1, f.edgeDensity * 2 + 0.3), center: f.focus }],
    composition: {
      subjectLocation: loc, centerOfInterest: f.focus, foreground: [], background: `${temp} ${bright} background`,
      negativeSpace: f.uniformCoverage > 0.5 ? "high" : f.uniformCoverage > 0.3 ? "medium" : "low",
      horizonY: null, framing: f.edgeDensity > 0.3 ? "close-up" : "medium",
    },
    geometry: { shapes: [] },
    motion: { camera, subject: "none", speed, zoom: "none" },
    depth: { foreground: [], middleground: [], background: [], passThroughCandidates: [] },
    color: { dominant: f.dominantColors, brightness: f.brightness, contrast: f.contrast, temperature: temp, mood: `${temp}, ${bright}` },
    materials: [],
    occlusionOpportunity: Math.min(1, occl),
    facesNearEdge: false,
    textPresent: false,
    tags: ["heuristic", temp, bright],
  };
}

export function heuristicPair(a: FrameAnalysis, fa: FrameFeatures, b: FrameAnalysis, fb: FrameFeatures, structural: number): PairAnalysis {
  const color = colorSimilarity(fa, fb);
  const rel: PairAnalysis["relationships"] = [];
  if (color > 0.45) rel.push({ kind: "color-bridge", from: "palette of A", to: "palette of B", confidence: color, note: "Shared colours let a wash hide the seam." });
  if (a.motion.speed !== "none" && a.motion.camera !== "static") {
    rel.push({ kind: "motion-continue", from: a.motion.camera, to: "B", confidence: a.motion.speed === "fast" ? 0.8 : 0.55, note: "The start clip is moving; keep it moving." });
  }
  if (a.occlusionOpportunity > 0.4) rel.push({ kind: "occlusion", from: "something crossing the lens", to: "B", confidence: a.occlusionOpportunity, note: "A near-total cover of the frame appears at the boundary." });
  rel.push({ kind: "zoom-bridge", from: "centre of interest in A", to: "centre of B", confidence: 0.35 + fa.edgeDensity * 0.3, note: "A push into the point of interest always has somewhere to go." });
  if (structural > 0.6) rel.push({ kind: "geometry-match", from: "layout of A", to: "layout of B", confidence: structural, note: "The two frames share a similar structure." });
  return {
    relationships: rel,
    ideas: [],
    visualSimilarity: structural,
    colorSimilarity: color,
    narrative: "",
    risks: fa.brightness < 0.15 || fb.brightness < 0.15 ? ["very dark frames"] : [],
  };
}
