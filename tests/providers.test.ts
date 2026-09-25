import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { config } from "@/core/config";
import { FAL_MODELS, falProvider, shouldLeaveQueue } from "@/core/providers/fal";
import { RUNWAY_MODELS, runwayProvider } from "@/core/providers/runway";
import { LOCAL_MODEL } from "@/core/providers/local";
import { PROVIDERS } from "@/core/providers/registry";
import { routeModels } from "@/core/providers/router";
import { ProviderError, type TransitionRequest } from "@/core/providers/types";
import { getRecipe } from "@/core/recipes/registry";

async function requestFixture(t: TestContext): Promise<TransitionRequest> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seam-provider-contract-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const firstFramePath = path.join(dir, "first.png"), lastFramePath = path.join(dir, "last.png");
  await sharp({ create: { width: 32, height: 24, channels: 3, background: "#503020" } }).png().toFile(firstFramePath);
  await sharp({ create: { width: 32, height: 24, channels: 3, background: "#206090" } }).png().toFile(lastFramePath);
  return {
    firstFramePath, lastFramePath, outputPath: path.join(dir, "bridge.mp4"),
    prompt: { positive: "The camera dives through coffee into blue ocean water.", negative: "blur, distort" },
    durationSec: 1.2, aspectRatio: "16:9", transitionType: "liquid-transform", motionStrength: 0.6,
    local: { spec: { width: 1280, height: 720, fps: 30 }, recipe: getRecipe("liquid-transform"), focusA: { x: 0.5, y: 0.5 }, focusB: { x: 0.5, y: 0.5 } },
  };
}

test("Kling Pro submits both JPEG endpoints; Standard never sends or opens a last frame", async (t) => {
  const req = await requestFixture(t);
  const requests: { url: string; body?: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).startsWith("https://queue.fal.run/fal-ai/")) return Response.json({ request_id: "test-kling", status_url: "https://unit.test/status", response_url: "https://unit.test/result" });
    if (String(url) === "https://unit.test/status") return Response.json({ status: "COMPLETED" });
    if (String(url) === "https://unit.test/result") return Response.json({ video: { url: "https://unit.test/output" } });
    if (String(url) === "https://unit.test/output") return new Response("mock-video");
    throw new Error("Unexpected provider request in contract test");
  });
  const pro = FAL_MODELS.find((model) => model.id === "fal:kling-2.1-pro")!;
  const result = await falProvider.generateTransition(req, pro);
  const input = requests[0].body!;
  assert.equal(requests[0].url, "https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video");
  assert.match(String(input.image_url), /^data:image\/jpeg;base64,\/9j\//);
  assert.match(String(input.tail_image_url), /^data:image\/jpeg;base64,\/9j\//);
  assert.notEqual(input.image_url, input.tail_image_url);
  assert.equal(input.duration, "5");
  assert.equal(input.negative_prompt, req.prompt.negative);
  assert.equal(result.providerJobId, "test-kling");
  assert.equal(await readFile(req.outputPath, "utf8"), "mock-video");

  requests.length = 0;
  const standard = FAL_MODELS.find((model) => model.id === "fal:kling-2.1-standard")!;
  await falProvider.generateTransition({ ...req, lastFramePath: "/missing-last-frame.png" }, standard);
  assert.equal(requests[0].url, "https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video");
  assert.equal(Object.hasOwn(requests[0].body!, "tail_image_url"), false);
});

test("the 2026-09-16 bridge models send both frames under their own field names, with audio off", async (t) => {
  const req = await requestFixture(t);
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://queue.fal.run/") && init?.method === "POST") {
      requests.push({ url: u, body: JSON.parse(String(init.body)) });
      return Response.json({ request_id: "test-new", status_url: "https://unit.test/status", response_url: "https://unit.test/result" });
    }
    if (u === "https://unit.test/status") return Response.json({ status: "COMPLETED" });
    if (u === "https://unit.test/result") return Response.json({ video: { url: "https://unit.test/output" } });
    if (u === "https://unit.test/output") return new Response("mock-video");
    throw new Error(`Unexpected provider request in contract test: ${u}`);
  });
  const expected: Record<string, { url: string; first: string; last: string; duration: unknown; extra: Record<string, unknown> }> = {
    "fal:minimax-h3-max": { url: "https://queue.fal.run/minimax/h3-max/image-to-video", first: "image_url", last: "end_image_url", duration: 5, extra: { resolution: "768P" } },
    "fal:wan-3.0-prime": { url: "https://queue.fal.run/alibaba/wan-3.0-prime/image-to-video", first: "start_image_url", last: "end_image_url", duration: 5, extra: { audio: false, aspect_ratio: "16:9", resolution: "720p" } },
    "fal:kling-o3-pro": { url: "https://queue.fal.run/fal-ai/kling-video/o3/pro/image-to-video", first: "image_url", last: "end_image_url", duration: "4", extra: { generate_audio: false } },
  };
  for (const [id, e] of Object.entries(expected)) {
    const model = FAL_MODELS.find((m) => m.id === id)!;
    assert.ok(model.supportsLastFrame && model.dialect === "plain", id);
    const result = await falProvider.generateTransition(req, model);
    const { url, body } = requests.at(-1)!;
    assert.equal(url, e.url);
    assert.equal(body.prompt, req.prompt.positive);
    assert.match(String(body[e.first]), /^data:image\/jpeg;base64,\/9j\//);
    assert.match(String(body[e.last]), /^data:image\/jpeg;base64,\/9j\//);
    assert.notEqual(body[e.first], body[e.last]);
    assert.equal(body.duration, e.duration);
    for (const [k, v] of Object.entries(e.extra)) assert.equal(body[k], v, `${id} ${k}`);
    assert.equal(Object.hasOwn(body, "tail_image_url"), false);
    assert.equal(Object.hasOwn(body, "negative_prompt"), false);
    assert.equal(result.costUsd, Number(e.duration) * model.costPerSecondUsd);
    assert.equal(await readFile(req.outputPath, "utf8"), "mock-video");
  }
});

test("Gen-4 Turbo sends the valid single-image body and documented output ratios", async (t) => {
  const req = await requestFixture(t);
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "https://api.dev.runwayml.com/v1/image_to_video") {
      assert.equal(new Headers(init?.headers).get("X-Runway-Version"), "2024-11-06");
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "test-runway" });
    }
    if (String(url) === "https://api.dev.runwayml.com/v1/tasks/test-runway") return Response.json({ id: "test-runway", status: "SUCCEEDED", output: ["https://unit.test/output"] });
    if (String(url) === "https://unit.test/output") return new Response("mock-video");
    throw new Error("Unexpected provider request in contract test");
  });
  for (const [aspectRatio, ratio] of [["16:9", "1280:720"], ["9:16", "720:1280"], ["1:1", "960:960"]] as const) {
    const result = await runwayProvider.generateTransition({ ...req, aspectRatio, lastFramePath: "/missing-last-frame.png" }, RUNWAY_MODELS[0]);
    const body = bodies.at(-1)!;
    assert.equal(body.model, "gen4_turbo");
    assert.equal(typeof body.promptImage, "string");
    assert.match(String(body.promptImage), /^data:image\/jpeg;base64,\/9j\//);
    assert.equal(body.promptText, req.prompt.positive);
    assert.equal(body.ratio, ratio);
    assert.equal(body.duration, 5);
    assert.equal(Object.hasOwn(body, "negativePrompt"), false);
    assert.equal(result.providerJobId, "test-runway");
  }
});

test("two-endpoint routing excludes Standard and Gen-4 Turbo in both generation modes", (t) => {
  const originalForce = config.providers.force;
  config.providers.force = "";
  t.after(() => { config.providers.force = originalForce; });
  for (const provider of PROVIDERS) t.mock.method(provider, "isAvailable", () => true);
  for (const mode of ["preview", "final"] as const) {
    const models = routeModels({ recipe: getRecipe("liquid-transform"), mode });
    const ids = models.map((model) => model.id);
    assert.equal(models.every((model) => model.supportsLastFrame), true, "only two-endpoint models may bridge");
    assert.ok(!ids.includes("fal:kling-2.1-standard") && !ids.includes("runway:gen4-turbo"), "first-frame-only models are excluded");
    assert.ok(ids.includes("fal:kling-2.1-pro") && ids.some((id) => id.startsWith("higgsfield:")), "every bridge-capable provider is offered");
    assert.ok(!ids.includes(LOCAL_MODEL.id), "ffmpeg is never routed while an AI bridge model is configured");
  }
  config.providers.force = "runway";
  assert.deepEqual(routeModels({ recipe: getRecipe("liquid-transform"), mode: "preview" }).map((model) => model.providerId), [], "forcing a provider with no two-endpoint model leaves nothing to route");
});

test("the last chance on a pair the cheap models could not bridge goes to the strongest model", (t) => {
  const originalForce = config.providers.force;
  config.providers.force = "";
  t.after(() => { config.providers.force = originalForce; });
  for (const provider of PROVIDERS) t.mock.method(provider, "isAvailable", () => true);
  // A morph is the case that matters: the cheap models are weak at it, which is what a preview would otherwise pick.
  const recipe = getRecipe("object-morph");
  const usual = routeModels({ recipe, mode: "preview" });
  const lastChance = routeModels({ recipe, mode: "preview", best: true });
  const strengths = lastChance.map((model) => model.strengths[recipe.modelClass] ?? 0.5);
  assert.equal(strengths[0], Math.max(...strengths), "the last attempt leads with the ablest model for the class");
  // A first preview attempt optimises expected time-to-accept, so it may already lead with the ablest model; the last chance never leads with a weaker one.
  assert.ok(strengths[0] >= (usual[0].strengths[recipe.modelClass] ?? 0.5), "the last chance is at least as able as the usual first pick");
  assert.deepEqual(lastChance.map((m) => m.id).sort(), usual.map((m) => m.id).sort(), "the same models are offered either way; only the order changes");
});

test("with no AI provider configured, the ffmpeg bridge is the only route", (t) => {
  const originalForce = config.providers.force;
  config.providers.force = "";
  t.after(() => { config.providers.force = originalForce; });
  for (const provider of PROVIDERS) if (provider.id !== "local") t.mock.method(provider, "isAvailable", () => false);
  const ids = routeModels({ recipe: getRecipe("liquid-transform"), mode: "preview" }).map((model) => model.id);
  assert.deepEqual(ids, [LOCAL_MODEL.id], "local development and CI still render a bridge without any provider key");
});

test("provider billing and invalid-request failures are not marked retryable", async (t) => {
  const req = await requestFixture(t);
  let status = 403, calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("test provider rejection", { status }); });
  await assert.rejects(falProvider.generateTransition(req, FAL_MODELS[1]), (error: unknown) => error instanceof ProviderError && error.providerId === "fal" && !error.retryable);
  assert.equal(calls, 1);
  status = 400;
  await assert.rejects(runwayProvider.generateTransition(req, RUNWAY_MODELS[0]), (error: unknown) => error instanceof ProviderError && error.providerId === "runway" && !error.retryable);
  assert.equal(calls, 2);
  status = 429;
  await assert.rejects(runwayProvider.generateTransition(req, RUNWAY_MODELS[0]), (error: unknown) => error instanceof ProviderError && error.retryable);
});

test("a backed-up fal queue is left quickly instead of waited out", () => {
  // fal's queues are shared by every fal customer; position 531 is other people's work, not ours.
  assert.equal(shouldLeaveQueue(531, 5_000), false, "give a long queue a few seconds to move");
  assert.equal(shouldLeaveQueue(531, 16_000), true);
  assert.equal(shouldLeaveQueue(4, 60_000), false, "a short queue is worth waiting for");
  assert.equal(shouldLeaveQueue(4, 91_000), true, "but not forever");
  assert.equal(shouldLeaveQueue(undefined, 91_000), true);
});
