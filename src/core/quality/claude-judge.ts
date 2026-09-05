/**
 * Claude quality judge: looks at the source frame, the destination frame and sampled bridge frames,
 * and scores the transition against the recipe's expected structure and quality criteria.
 */
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { anthropic, usageCost } from "@/core/analysis/claude-analyzer";
import { jpegForModel } from "@/core/media/image";
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
List concrete issues in "issues" (empty if none).`;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export async function claudeJudge(bridgePath: string, sourceFrame: string, destFrame: string, recipe: TransitionRecipe, prompt: string): Promise<{ scores: QualityScores; costUsd: number }> {
  const model = config.anthropic.judgeModel;
  const samples = await sampleFrames(bridgePath, path.join(path.dirname(bridgePath), "judge-claude"), 5, "judge");
  const img = async (p: string): Promise<Anthropic.ImageBlockParam> => ({
    type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await jpegForModel(p, 768)).toString("base64") },
  });
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: "SOURCE frame:" }, await img(sourceFrame), { type: "text", text: "DESTINATION frame:" }, await img(destFrame)];
  for (let i = 0; i < samples.length; i++) {
    content.push({ type: "text", text: `Bridge frame ${i + 1}/${samples.length} (t=${samples[i].t.toFixed(2)}s):` });
    content.push(await img(samples[i].path));
  }
  content.push({
    type: "text",
    text: `Requested transition: ${recipe.name}. Expected structure: ${recipe.expectedStructure.join(" -> ")}. ` +
      `Quality criteria to emphasise: ${recipe.qualityCriteria.join(", ")}. Prompt used: ${prompt.slice(0, 800)}`,
  });
  const res = await anthropic().messages.parse({
    model, max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(Schema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`judge unavailable (${res.stop_reason})`);
  const p = res.parsed_output;
  const scores: QualityScores = {
    startFidelity: clamp(p.startFidelity), endFidelity: clamp(p.endFidelity), subjectConsistency: clamp(p.subjectConsistency),
    continuity: clamp(p.continuity), artifacts: clamp(p.artifacts), aesthetic: clamp(p.aesthetic), transitionSuccess: clamp(p.transitionSuccess),
    overall: clamp(p.overall), issues: p.issues.slice(0, 8),
  };
  const costUsd = usageCost(model, res.usage);
  log.info("judged", { overall: scores.overall, issues: scores.issues.length, costUsd: Number(costUsd.toFixed(4)) });
  return { scores, costUsd };
}
