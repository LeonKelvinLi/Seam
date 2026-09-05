import type { FrameAnalysis, FrameFeatures, PairAnalysis } from "@/core/types";

export const feat = (o: Partial<FrameFeatures> = {}): FrameFeatures => ({
  sharpness: 0.7, brightness: 0.5, contrast: 0.5, edgeDensity: 0.2, motion: 0.1, driftX: 0, driftY: 0, uniformCoverage: 0.2,
  dominantColors: ["#5a3418", "#efe6d6", "#1b100a"], focus: { x: 0.5, y: 0.5 }, ...o,
});

export const frame = (o: Partial<FrameAnalysis> = {}): FrameAnalysis => ({
  description: "a scene", subjects: [], composition: { subjectLocation: "center", centerOfInterest: { x: 0.5, y: 0.5 }, foreground: [], background: "room", negativeSpace: "medium", horizonY: null, framing: "medium" },
  geometry: { shapes: [] }, motion: { camera: "static", subject: "none", speed: "none", zoom: "none" }, depth: { foreground: [], middleground: [], background: [], passThroughCandidates: [] },
  color: { dominant: ["#5a3418"], brightness: 0.5, contrast: 0.5, temperature: "warm", mood: "warm" }, materials: [], occlusionOpportunity: 0, facesNearEdge: false, textPresent: false, tags: [], ...o,
});

export const coffee: FrameAnalysis = frame({
  description: "close-up of a woman holding a white coffee cup toward the camera, dark coffee surface visible",
  subjects: [{ label: "coffee cup", category: "drink", prominence: 0.9, center: { x: 0.5, y: 0.55 } }, { label: "woman", category: "person", prominence: 0.5, center: { x: 0.5, y: 0.3 } }],
  composition: { subjectLocation: "center", centerOfInterest: { x: 0.5, y: 0.55 }, foreground: ["coffee cup"], background: "kitchen", negativeSpace: "low", horizonY: null, framing: "close-up" },
  geometry: { shapes: [{ type: "circle", label: "cup rim", center: { x: 0.5, y: 0.55 }, size: 0.4 }, { type: "cup", label: "coffee cup", center: { x: 0.5, y: 0.55 }, size: 0.45 }] },
  motion: { camera: "push-in", subject: "toward", speed: "slow", zoom: "in" },
  depth: { foreground: ["coffee cup"], middleground: ["hands"], background: ["kitchen"], passThroughCandidates: ["coffee surface"] },
  materials: ["liquid", "coffee", "ceramic"], tags: ["coffee", "morning"],
});

export const ocean: FrameAnalysis = frame({
  description: "aerial drone shot over deep blue ocean with sun reflection",
  subjects: [{ label: "ocean", category: "water", prominence: 0.9, center: { x: 0.5, y: 0.6 } }],
  composition: { subjectLocation: "full-frame", centerOfInterest: { x: 0.6, y: 0.4 }, foreground: [], background: "sea and sky", negativeSpace: "high", horizonY: 0.3, framing: "aerial" },
  geometry: { shapes: [{ type: "circle", label: "sun reflection", center: { x: 0.7, y: 0.3 }, size: 0.15 }, { type: "horizon", label: "horizon", center: { x: 0.5, y: 0.3 }, size: 0.8 }] },
  motion: { camera: "crane", subject: "none", speed: "slow", zoom: "none" },
  depth: { foreground: [], middleground: ["waves"], background: ["horizon"], passThroughCandidates: [] },
  color: { dominant: ["#1a6ea3", "#06263f"], brightness: 0.55, contrast: 0.6, temperature: "cool", mood: "calm" }, materials: ["water", "ocean"], tags: ["aerial", "ocean"],
});

export const coffeeOceanPair: PairAnalysis = {
  relationships: [
    { kind: "material-bridge", from: "coffee surface", to: "ocean water", confidence: 0.9, note: "dark liquid becomes water" },
    { kind: "move-through", from: "cup", to: "ocean", confidence: 0.85, note: "dive into the cup" },
    { kind: "geometry-match", from: "cup rim", to: "sun reflection", confidence: 0.7, note: "circles" },
    { kind: "zoom-bridge", from: "cup", to: "ocean", confidence: 0.6, note: "push in" },
  ],
  ideas: [{ recipeId: "liquid-transform", title: "Dive Through the Coffee", why: "The camera dives into the cup and emerges over the ocean.", confidence: 0.9, wow: 0.9 }],
  visualSimilarity: 0.3, colorSimilarity: 0.3, narrative: "coffee to ocean", risks: [],
};
