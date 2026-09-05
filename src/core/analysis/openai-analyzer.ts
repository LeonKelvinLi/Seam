/** OpenAI vision analysis and footage-specific transition ideas. */
import type OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { imageInput, openai, OpenAIOutputError, structuredResponse } from "@/core/openai";
import { catalogSummary, hasRecipe } from "@/core/recipes/registry";
import type { FrameAnalysis, PairAnalysis } from "@/core/types";
import { FramesResponseSchema, PairAnalysisSchema, normalizeFrame, normalizePair } from "./schema";

const log = logger("vision");

const FRAME_SYSTEM = `You are the visual analysis engine inside a video editing tool that designs transitions between two clips.
You will be shown consecutive frames from the boundary region of one clip (its last moments, or its first moments).
For EVERY frame, in order, return a structured analysis. Be concrete and literal: name real objects, materials and shapes you can see.
Coordinates are normalised (0..1, origin top-left). Motion should be inferred by comparing the consecutive frames.
"occlusionOpportunity" is high when something (a hand, a jacket, a passing car, a wall) is about to cover, or is covering, most of the lens.
"passThroughCandidates" are objects the camera could plausibly fly through or into (doors, windows, screens, cups, eyes, tunnels, water).
"materials" lists visible materials and substances (liquid, coffee, water, glass, steam, smoke, fabric, metal, wood, fire, sand, clouds...).
Keep every string short. Do not describe the frames as images; describe the scene.`;

const PAIR_SYSTEM = `You are a world-class editor and VFX supervisor who designs "impossible" transitions between two shots.
You will see the LAST frame of clip A and the FIRST frame of clip B, plus structured analyses of both.
Find the strongest visual relationships between them and propose specific transition ideas.
Each idea must reference a recipe id from the catalog below, have a short human title (max 6 words, like "Dive Through the Coffee"),
and a one-sentence "why" written for a non-technical creator (no model or VFX jargon).
Rank ideas by how good they would actually look, and be honest about risks (faces near the frame edge, text, thin structures, mismatched perspective).
Recipe catalog (id: name — description):
`;

export async function openaiAnalyzeFrames(frames: { path: string; t: number }[], side: "start" | "end", api: OpenAI = openai()): Promise<{ frames: FrameAnalysis[]; costUsd: number }> {
  if (frames.length === 0) return { frames: [], costUsd: 0 };
  const model = config.openai.visionModel;
  const content: ResponseInputContent[] = [];
  for (let i = 0; i < frames.length; i++) {
    content.push({ type: "input_text", text: `Frame ${i + 1} of ${frames.length} (t=${frames[i].t.toFixed(2)}s, ${side === "start" ? "end of clip A" : "beginning of clip B"}):` });
    content.push(await imageInput(frames[i].path));
  }
  content.push({ type: "input_text", text: `Return exactly ${frames.length} frame analyses in order.` });
  const res = await structuredResponse({
    model, instructions: FRAME_SYSTEM, content, schema: FramesResponseSchema, name: "frame_analysis", maxOutputTokens: 12000,
  }, api);
  if (res.data.frames.length !== frames.length) throw new OpenAIOutputError("frame_count");
  log.info("frames analysed", { n: frames.length, side, model, costUsd: Number(res.costUsd.toFixed(4)) });
  return { frames: res.data.frames.map(normalizeFrame), costUsd: res.costUsd };
}

export async function openaiAnalyzePair(a: { path: string; analysis: FrameAnalysis }, b: { path: string; analysis: FrameAnalysis }, api: OpenAI = openai()): Promise<{ pair: PairAnalysis; costUsd: number }> {
  const res = await structuredResponse({
    model: config.openai.visionModel,
    instructions: PAIR_SYSTEM + catalogSummary(),
    content: [
      { type: "input_text", text: "LAST frame of clip A:" }, await imageInput(a.path),
      { type: "input_text", text: "FIRST frame of clip B:" }, await imageInput(b.path),
      { type: "input_text", text: `Analysis of A: ${JSON.stringify(a.analysis)}\n\nAnalysis of B: ${JSON.stringify(b.analysis)}\n\nPropose 4 to 8 ideas.` },
    ],
    schema: PairAnalysisSchema, name: "pair_analysis", maxOutputTokens: 8000,
  }, api);
  const pair = normalizePair(res.data);
  pair.ideas = pair.ideas.filter((idea) => hasRecipe(idea.recipeId));
  log.info("pair analysed", { ideas: pair.ideas.length, relationships: pair.relationships.length, costUsd: Number(res.costUsd.toFixed(4)) });
  return { pair, costUsd: res.costUsd };
}
