import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent, ResponseUsage } from "openai/resources/responses/responses";
import { z } from "zod";
import { jpegForModel } from "@/core/media/image";
import { logger } from "@/core/log";

const log = logger("openai");
let client: OpenAI | null = null;
export function openai(): OpenAI {
  return client ??= new OpenAI({ timeout: 120_000, maxRetries: 1 });
}

export async function imageInput(file: string, maxEdge = 1024): Promise<ResponseInputContent> {
  const jpeg = await jpegForModel(file, maxEdge);
  return { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" };
}

export class OpenAIOutputError extends Error {
  constructor(readonly reason: "incomplete" | "refused" | "invalid_output" | "frame_count") {
    super(`OpenAI response unavailable (${reason})`);
    this.name = "OpenAIOutputError";
  }
}

/** Never log provider response bodies, prompts, image data, or credential-bearing errors. */
export function openaiErrorSummary(error: unknown): string {
  if (error instanceof OpenAIOutputError) return error.reason;
  if (error instanceof OpenAI.APIError) {
    // The code is a short enum that tells a rate limit (rate_limit_exceeded) from an empty account (insufficient_quota).
    const code = typeof error.code === "string" && /^[a-z0-9_]{1,40}$/.test(error.code) ? `, ${error.code}` : "";
    return `API error (status ${error.status ?? "unknown"}${code})`;
  }
  return "OpenAI request or media preparation failed";
}

/** Standard token rates in USD per million (input, cached input, output); not the provider's billing total. */
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 }, // verified 2026-09-05
  "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 }, // verified 2026-09-16 on developers.openai.com
};

export function usageCost(model: string, usage?: ResponseUsage): number {
  if (!usage) return 0;
  const price = PRICES[model] ?? Object.entries(PRICES).find(([id]) => model.startsWith(`${id}-`))?.[1];
  if (!price) {
    log.warn("cost estimate unavailable for configured model", { model });
    return 0;
  }
  const cached = Math.min(usage.input_tokens, Math.max(0, usage.input_tokens_details?.cached_tokens ?? 0));
  return ((usage.input_tokens - cached) * price.input + cached * price.cached + usage.output_tokens * price.output) / 1e6;
}

/**
 * An empty OpenAI account (credit_balance_exhausted, insufficient_quota) will not refill in minutes. While it is empty
 * nothing can judge a bridge, so generation stops before paying for renders (2026-09-29: every run rendered, then
 * refunded, while analysis quietly fell back to the heuristic).
 */
let outOfCreditUntil = 0;
const OUT_OF_CREDIT_MS = 10 * 60_000;
export function openaiOutOfCredit(now = Date.now()): boolean {
  return now < outOfCreditUntil;
}
export function noteOpenAIError(error: unknown, now = Date.now()): void {
  if (error instanceof OpenAI.APIError && /credit_balance_exhausted|insufficient_quota|billing_hard_limit/.test(`${error.code ?? ""} ${error.message}`)) {
    outOfCreditUntil = now + OUT_OF_CREDIT_MS;
  }
}
export function resetOpenAICredit(): void {
  outOfCreditUntil = 0;
}

export async function structuredResponse<T extends z.ZodType>(args: {
  model: string;
  instructions: string;
  content: ResponseInputContent[];
  schema: T;
  name: string;
  maxOutputTokens: number;
}, api: OpenAI = openai()): Promise<{ data: z.infer<T>; costUsd: number }> {
  const response = await api.responses.create({
    model: args.model,
    instructions: args.instructions,
    input: [{ role: "user", content: args.content }],
    text: { format: zodTextFormat(args.schema, args.name) },
    reasoning: { effort: "low" },
    max_output_tokens: args.maxOutputTokens,
    store: false,
  }).catch((e: unknown) => { noteOpenAIError(e); throw e; });
  outOfCreditUntil = 0;
  // Check completion/refusal before parsing: a truncated JSON object is never usable output.
  if (response.status !== "completed") throw new OpenAIOutputError("incomplete");
  const blocks = response.output.flatMap((item) => item.type === "message" ? item.content : []);
  if (blocks.some((block) => block.type === "refusal")) throw new OpenAIOutputError("refused");
  const text = blocks.filter((block) => block.type === "output_text").map((block) => block.text).join("");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new OpenAIOutputError("invalid_output"); }
  const parsed = args.schema.safeParse(json);
  if (!parsed.success) throw new OpenAIOutputError("invalid_output");
  return { data: parsed.data, costUsd: usageCost(args.model, response.usage) };
}
