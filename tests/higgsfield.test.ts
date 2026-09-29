import test from "node:test";
import assert from "node:assert/strict";
import { DOP_DEFAULT_MOTION, DOP_MOTIONS, HIGGSFIELD_MODELS, HIGGSFIELD_NOT_ENABLED, buildBody, parseStatus } from "@/core/providers/higgsfield";
import { ProviderError } from "@/core/providers/types";

const req = { prompt: { positive: "a seamless dolly from the cup into the ocean", negative: null }, aspectRatio: "9:16" as const };

test("Higgsfield DoP requests carry both boundary frames with the OpenAPI field names", () => {
  const dop = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:dop-lite")!;
  assert.deepEqual(buildBody(dop, req, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: req.prompt.positive, image_url: "https://cdn/a.jpg", end_image_url: "https://cdn/b.jpg", enhance_prompt: false,
  });
  assert.ok(HIGGSFIELD_MODELS.every((m) => m.supportsLastFrame), "every routed Higgsfield model is a true bridge model");
});

test("Veo 3.1 stays out of routing but keeps a correct request body for when the account is enabled", () => {
  assert.ok(!HIGGSFIELD_MODELS.some((m) => m.endpoint.startsWith("/veo")), "Veo answers this account with 404 model_not_found");
  const veo = HIGGSFIELD_NOT_ENABLED.find((m) => m.id === "higgsfield:veo3.1-fast-flf")!;
  const body = buildBody(veo, req, "https://cdn/a.jpg", "https://cdn/b.jpg");
  assert.equal(body.first_frame_url, "https://cdn/a.jpg");
  assert.equal(body.last_frame_url, "https://cdn/b.jpg");
  assert.equal(body.duration, "4");
  assert.equal(body.aspect_ratio, "9:16");
  assert.equal(buildBody(veo, { ...req, aspectRatio: "1:1" }, "a", "b").aspect_ratio, "16:9");
});

test("status polling resolves completed videos and types the failure modes", () => {
  assert.equal(parseStatus({ status: "queued" }), null);
  assert.equal(parseStatus({ status: "in_progress" }), null);
  assert.deepEqual(parseStatus({ status: "completed", video: { url: "https://cdn/out.mp4" } }), { url: "https://cdn/out.mp4" });
  assert.throws(() => parseStatus({ status: "failed", error: "boom" }), (e: unknown) => e instanceof ProviderError && e.retryable);
  assert.throws(() => parseStatus({ status: "nsfw" }), (e: unknown) => e instanceof ProviderError && !e.retryable);
  assert.throws(() => parseStatus({ status: "completed", video: null }), ProviderError);
});

test("MiniMax H3 and Kling 3.0 on Higgsfield carry the end frame under their own field names", () => {
  const h3 = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:minimax-h3")!;
  assert.deepEqual(buildBody(h3, req, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: req.prompt.positive, image_url: "https://cdn/a.jpg", end_image_url: "https://cdn/b.jpg", duration: 5, resolution: "2K", aspect_ratio: "9:16",
  });
  const kling = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:kling-3.0-pro")!;
  assert.deepEqual(buildBody(kling, req, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: req.prompt.positive, image_url: "https://cdn/a.jpg", last_image_url: "https://cdn/b.jpg", duration: 5, sound: "off",
  });
});

test("DoP start+end frame sends no prompt of ours: Higgsfield writes the shot and the style is a motion preset", () => {
  const dop = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:dop-turbo-flf")!;
  assert.equal(dop.ownPrompt, true);
  assert.deepEqual(buildBody(dop, { ...req, transitionType: "whip-pan", motionStrength: 0.6 }, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: "", image_url: "https://cdn/a.jpg", end_image_url: "https://cdn/b.jpg", enhance_prompt: true, motions: [{ id: DOP_MOTIONS["whip-pan"], strength: 0.7 }],
  });
  const body = buildBody(dop, { ...req, transitionType: "color-match" }, "https://cdn/a.jpg", "https://cdn/b.jpg");
  assert.deepEqual(body.motions, [{ id: DOP_DEFAULT_MOTION, strength: 0.8 }], "a style without a camera move gets Through Object In");
});
