import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import OpenAI from "openai";
import { z } from "zod";
import { openaiAnalyzeFrames, openaiAnalyzePair } from "@/core/analysis/openai-analyzer";
import { OpenAIOutputError, openaiErrorSummary, structuredResponse, usageCost } from "@/core/openai";
import { coffee, ocean, coffeeOceanPair } from "./fixtures";

const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 20 }, total_tokens: 1100 };
function mockApi(payload: unknown, responseOverrides: Record<string, unknown> = {}) {
  const requests: { url: string; body: Record<string, any> }[] = [];
  const api = new OpenAI({ apiKey: "unit-test-key", maxRetries: 0, fetch: async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      id: "resp_test", object: "response", status: "completed", model: "gpt-5.4-mini", usage,
      output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(payload), annotations: [] }] }],
      ...responseOverrides,
    }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  return { api, requests };
}

test("OpenAI analyzer sends ordered JPEG Responses input and strict schemas; pair ideas stay in the catalog", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seam-openai-"));
  try {
    const file = path.join(dir, "frame.png");
    await sharp({ create: { width: 24, height: 24, channels: 3, background: "#5a3418" } }).png().toFile(file);
    const frames = mockApi({ frames: [coffee, ocean] });
    const result = await openaiAnalyzeFrames([{ path: file, t: 0.1 }, { path: file, t: 0.2 }], "start", frames.api);
    assert.equal(result.frames[0].description, coffee.description);
    assert.ok(result.costUsd > 0);
    const request = frames.requests[0];
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.body.store, false);
    assert.equal(request.body.reasoning.effort, "low");
    assert.equal(request.body.text.format.type, "json_schema");
    assert.equal(request.body.text.format.strict, true);
    assert.equal(request.body.text.format.schema.additionalProperties, false);
    assert.deepEqual(request.body.text.format.schema.required, ["frames"]);
    const content = request.body.input[0].content;
    assert.deepEqual(content.map((part: { type: string }) => part.type), ["input_text", "input_image", "input_text", "input_image", "input_text"]);
    assert.match(content[0].text, /t=0.10s, end of clip A/);
    assert.match(content[1].image_url, /^data:image\/jpeg;base64,\/9j\//);
    assert.equal(content[1].detail, "high");

    const pairApi = mockApi({ ...coffeeOceanPair, ideas: [...coffeeOceanPair.ideas, { ...coffeeOceanPair.ideas[0], recipeId: "invented-recipe" }] });
    const pair = await openaiAnalyzePair({ path: file, analysis: coffee }, { path: file, analysis: ocean }, pairApi.api);
    assert.deepEqual(pair.pair.ideas.map((idea) => idea.recipeId), ["liquid-transform"]);
    assert.equal(pairApi.requests[0].body.input[0].content.filter((part: { type: string }) => part.type === "input_image").length, 2);
    const missing = mockApi({ frames: [] });
    await assert.rejects(openaiAnalyzeFrames([{ path: file, t: 0 }], "end", missing.api), (error: unknown) => error instanceof OpenAIOutputError && error.reason === "frame_count");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("OpenAI adapter rejects incomplete, refused, malformed and schema-invalid outputs", async () => {
  const args = { model: "gpt-5.4-mini", instructions: "Test", content: [{ type: "input_text" as const, text: "Test" }], schema: z.object({ score: z.number() }), name: "score", maxOutputTokens: 100 };
  for (const [reason, payload, overrides] of [
    ["incomplete", { score: 1 }, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }],
    ["refused", null, { output: [{ type: "message", content: [{ type: "refusal", refusal: "Declined" }] }] }],
    ["invalid_output", { score: "wrong-type" }, {}],
    ["invalid_output", null, { output: [{ type: "message", content: [{ type: "output_text", text: "{unfinished" }] }] }],
  ] as const) {
    const { api } = mockApi(payload, overrides);
    await assert.rejects(structuredResponse(args, api), (error: unknown) => error instanceof OpenAIOutputError && error.reason === reason);
  }
});

test("OpenAI cost estimate counts cached tokens and diagnostics omit provider bodies", () => {
  assert.ok(Math.abs(usageCost("gpt-5.4-mini", usage) - 0.001065) < 1e-12);
  const error = new OpenAI.APIError(401, { message: "secret prompt and sk-private-key" }, "sk-private-key", new Headers());
  assert.equal(openaiErrorSummary(error), "API error (status 401)");
  assert.doesNotMatch(openaiErrorSummary(new Error("sk-private-key")), /sk-private|secret prompt/);
});
