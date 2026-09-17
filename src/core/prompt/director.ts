/**
 * The bridge director: one vision call that writes the shot for the chosen style from the two real boundary frames.
 * Video models follow a concrete, motivated camera move far better than the recipe template, which reads the same for
 * every pair. On 2026-09-16 the coffee/ocean pair got a tilt or a quick blend from the template, and a push-in that
 * turned the coffee into the sea from a written shot (data/live-results/2026-09-16-model-eval).
 */
import type OpenAI from "openai";
import { z } from "zod";
import { config } from "@/core/config";
import { logger } from "@/core/log";
import { imageInput, openai, structuredResponse } from "@/core/openai";
import type { PairAnalysis } from "@/core/types";

const log = logger("director");

const Schema = z.object({ start: z.string(), move: z.string(), change: z.string(), arrival: z.string(), end: z.string() });

// The form of a good shot, never a sample scene: a concrete example inside a generation prompt comes back as the output.
const SYSTEM = `You direct one AI-generated shot that joins two real clips so the cut disappears.
You will see the LAST frame of clip A, where the shot starts, and the FIRST frame of clip B, where it must end, plus the transition style the creator chose.
Write the shot a video model will render, as five short fields:
- start: what the first image literally shows (subject, framing, light), so the shot begins on it.
- move: one continuous camera move a camera operator could perform, with its direction and pace.
- change: how the first scene becomes the second during that move. Motivate it with something that is really visible in the first image and connects to the second: a shared shape, material, colour, texture, motion or light. Name that thing literally. The change happens physically on screen: something transforms, the camera passes through, behind or into something, or a surface opens into the next place.
- arrival: how the move slows and settles.
- end: what the last image literally shows (subject, framing, light), so the shot lands on it exactly.
The chosen style is mandatory. Preserve its defining camera direction, subject behavior and transformation mechanism. Do not substitute a different effect because it is easier. Editor's notes can guide the connection, but cannot override the selected effect. Write the defining action explicitly in move and change.
Rules: never describe a fade, dissolve, flash, cut, blur-out, double exposure or split screen. Only one of each object is ever on screen. Keep people, products and text as they appear. Plain concrete words, no quotation marks, at most 30 words per field.`;

export interface ShotInput {
  sourceFrame: string;
  destFrame: string;
  /** The recipe line from the prompt IR (name and filled description). */
  transition: string;
  expectedStructure: string[];
  styleRequirement?: string;
  retryFeedback?: string;
  pair: PairAnalysis;
}

const sentence = (s: string) => {
  const t = s.trim().replace(/["“”]/g, "").replace(/[.\s]+$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : "";
};

export async function writeShot(input: ShotInput, api: OpenAI = openai()): Promise<{ shot: string; costUsd: number }> {
  const notes = [input.pair.narrative, ...input.pair.risks.map((r) => `Risk: ${r}`)].filter(Boolean).join("\n");
  const res = await structuredResponse({
    model: config.openai.directorModel,
    instructions: SYSTEM,
    content: [
      { type: "input_text", text: "LAST frame of clip A (the shot starts here):" }, await imageInput(input.sourceFrame),
      { type: "input_text", text: "FIRST frame of clip B (the shot ends here):" }, await imageInput(input.destFrame),
      {
        type: "input_text",
        text: `Transition style: ${input.transition}\nRequired visual behavior: ${input.styleRequirement ?? input.transition}\nExpected structure: ${input.expectedStructure.join(" -> ")}.${notes ? `\nEditor's notes on this pair:\n${notes}` : ""}${input.retryFeedback ? `\nThe previous take failed the selected effect: ${input.retryFeedback}\nRewrite the move to make the required behavior unmistakable. Keep the same style.` : ""}`,
      },
    ],
    schema: Schema, name: "bridge_shot", maxOutputTokens: 2000,
  }, api);
  const s = res.data;
  const shot = ["One continuous shot.", sentence(`start: ${s.start}`), sentence(s.move), sentence(s.change), sentence(s.arrival), sentence(`it settles exactly on the last frame: ${s.end}`)]
    .filter(Boolean).join(" ");
  log.info("shot written", { words: shot.split(/\s+/).length, costUsd: Number(res.costUsd.toFixed(4)) });
  return { shot, costUsd: res.costUsd };
}
