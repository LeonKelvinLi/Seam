/**
 * Claude vision analyzer: looks at the boundary frames, returns structured understanding,
 * and proposes concrete transition ideas in human language mapped to catalog recipe ids.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { jpegForModel } from "@/core/media/image";
import { catalogSummary, hasRecipe } from "@/core/recipes/registry";
import type { FrameAnalysis, PairAnalysis } from "@/core/types";
import { FramesResponseSchema, PairAnalysisSchema, normalizeFrame, normalizePair } from "./schema";

const log = logger("vision");

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** Rough first-party pricing for cost tracking (USD per token). */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5 / 1e6, out: 25 / 1e6 },
  "claude-sonnet-5": { in: 2 / 1e6, out: 10 / 1e6 },
  "claude-haiku-4-5": { in: 1 / 1e6, out: 5 / 1e6 },
  "claude-fable-5-1": { in: 10 / 1e6, out: 50 / 1e6 },
};
export function usageCost(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }): number {
  const p = PRICE[model] ?? PRICE["claude-opus-5"];
  const cached = usage.cache_read_input_tokens ?? 0;
  return (usage.input_tokens - cached) * p.in + cached * p.in * 0.1 + usage.output_tokens * p.out;
}

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

async function imageBlock(path: string): Promise<Anthropic.ImageBlockParam> {
  const buf = await jpegForModel(path, 1024);
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } };
}

export async function claudeAnalyzeFrames(frames: { path: string; t: number }[], side: "start" | "end"): Promise<{ frames: FrameAnalysis[]; costUsd: number }> {
  const model = config.anthropic.visionModel;
  const content: Anthropic.ContentBlockParam[] = [];
  for (let i = 0; i < frames.length; i++) {
    content.push({ type: "text", text: `Frame ${i + 1} of ${frames.length} (t=${frames[i].t.toFixed(2)}s, ${side === "start" ? "end of clip A" : "beginning of clip B"}):` });
    content.push(await imageBlock(frames[i].path));
  }
  content.push({ type: "text", text: `Return exactly ${frames.length} frame analyses in order.` });

  const res = await anthropic().messages.parse({
    model,
    max_tokens: 12000,
    system: [{ type: "text", text: FRAME_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(FramesResponseSchema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`vision analysis unavailable (${res.stop_reason})`);
  const out = res.parsed_output.frames.map(normalizeFrame);
  while (out.length < frames.length) out.push(out[out.length - 1]);
  const costUsd = usageCost(model, res.usage);
  log.info("frames analysed", { n: frames.length, side, model, costUsd: Number(costUsd.toFixed(4)) });
  return { frames: out.slice(0, frames.length), costUsd };
}

export async function claudeAnalyzePair(a: { path: string; analysis: FrameAnalysis }, b: { path: string; analysis: FrameAnalysis }): Promise<{ pair: PairAnalysis; costUsd: number }> {
  const model = config.anthropic.visionModel;
  const res = await anthropic().messages.parse({
    model,
    max_tokens: 8000,
    system: [{ type: "text", text: PAIR_SYSTEM + catalogSummary(), cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "LAST frame of clip A:" }, await imageBlock(a.path),
        { type: "text", text: "FIRST frame of clip B:" }, await imageBlock(b.path),
        { type: "text", text: `Analysis of A: ${JSON.stringify(a.analysis)}\n\nAnalysis of B: ${JSON.stringify(b.analysis)}\n\nPropose 4 to 8 ideas.` },
      ],
    }],
    output_config: { format: zodOutputFormat(PairAnalysisSchema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`pair analysis unavailable (${res.stop_reason})`);
  const pair = normalizePair(res.parsed_output);
  pair.ideas = pair.ideas.filter((i) => hasRecipe(i.recipeId));
  const costUsd = usageCost(model, res.usage);
  log.info("pair analysed", { ideas: pair.ideas.length, relationships: pair.relationships.length, costUsd: Number(costUsd.toFixed(4)) });
  return { pair, costUsd };
}
