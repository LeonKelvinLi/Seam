/** OpenAI judges source/destination fidelity and sampled bridge continuity. */
import path from "node:path";
import type OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { z } from "zod";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { imageInput, openai, structuredResponse } from "@/core/openai";
import { sampleFrames } from "@/core/media/ffmpeg";
import type { TransitionRecipe } from "@/core/recipes/types";
import type { QualityScores } from "@/core/types";

const log = logger("judge");

const Schema = z.object({
  startFidelity: z.number(), endFidelity: z.number(), subjectConsistency: z.number(), continuity: z.number(),
  artifacts: z.number(), aesthetic: z.number(), transitionSuccess: z.number(), overall: z.number(), issues: z.array(z.string()),
});

const SYSTEM = `You are a ruthless VFX quality inspector for AI-generated video transitions.
You will see the SOURCE frame (the last real frame before the transition), the DESTINATION frame (the first real frame after it),
and frames sampled evenly across the generated bridge, in order.
Score 0-100 (higher is better) for:
- startFidelity: does the first bridge frame match the SOURCE frame (composition, subject, colours)?
- endFidelity: does the last bridge frame match the DESTINATION frame?
- subjectConsistency: did people/products keep identity, proportions, count?
- continuity: does the motion read as one continuous move (no jumps, no direction flips)?
- artifacts: 100 = clean. Penalise extra limbs, warped faces, duplicated objects, unexpected text, geometry collapse, flicker, abrupt cuts.
- aesthetic: does it look good as cinema?
- transitionSuccess: did the requested transition actually happen as described?
- overall: your honest verdict for a short-form creator, weighted toward fidelity and artifacts.
A transition fails when the scenes are blended instead of joined: a cross-dissolve, a fade, a double exposure (one scene see-through over the
other in the same place), a half-and-half wipe, or a hard cut. For any of these, score continuity and transitionSuccess 30 or lower and
overall 50 or lower, and name it in "issues". A portal is not a blend: the next scene may appear inside a real shape of the first one
(a window, a rim, a lens, a surface) and grow until it fills the frame.
List concrete issues in "issues" (empty if none).`;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
/** Nine frames put a sample every ~0.25 s on a 2 s bridge; with five, a 0.2 s double exposure passed unseen at 76 on 2026-09-16. */
export const JUDGE_SAMPLES = 9;

export async function openaiJudge(bridgePath: string, sourceFrame: string, destFrame: string, recipe: TransitionRecipe, prompt: string, api: OpenAI = openai(), model = config.openai.judgeModel): Promise<{ scores: QualityScores; costUsd: number }> {
  // One folder per bridge: fan-out siblings are judged in the same render directory, sometimes at the same moment.
  const sampleDir = path.join(path.dirname(bridgePath), `judge-openai-${path.basename(bridgePath, path.extname(bridgePath))}`);
  const samples = await sampleFrames(bridgePath, sampleDir, JUDGE_SAMPLES, "judge");
  const content: ResponseInputContent[] = [
    { type: "input_text", text: "SOURCE frame:" }, await imageInput(sourceFrame, 768),
    { type: "input_text", text: "DESTINATION frame:" }, await imageInput(destFrame, 768),
  ];
  for (let i = 0; i < samples.length; i++) {
    content.push({ type: "input_text", text: `Bridge frame ${i + 1}/${samples.length} (t=${samples[i].t.toFixed(2)}s):` });
    content.push(await imageInput(samples[i].path, 768));
  }
  content.push({
    type: "input_text",
    text: `Requested transition: ${recipe.name}. Expected structure: ${recipe.expectedStructure.join(" -> ")}. ` +
      `Quality criteria to emphasise: ${recipe.qualityCriteria.join(", ")}. Prompt used: ${prompt.slice(0, 800)}`,
  });
  const res = await structuredResponse({
    model, instructions: SYSTEM, content, schema: Schema, name: "quality_scores", maxOutputTokens: 4000,
  }, api);
  const p = res.data;
  const scores: QualityScores = {
    startFidelity: clamp(p.startFidelity), endFidelity: clamp(p.endFidelity), subjectConsistency: clamp(p.subjectConsistency),
    continuity: clamp(p.continuity), artifacts: clamp(p.artifacts), aesthetic: clamp(p.aesthetic), transitionSuccess: clamp(p.transitionSuccess),
    overall: clamp(p.overall), issues: p.issues.slice(0, 8),
  };
  log.info("judged", { model, overall: scores.overall, issues: scores.issues.length, costUsd: Number(res.costUsd.toFixed(4)) });
  return { scores, costUsd: res.costUsd };
}
