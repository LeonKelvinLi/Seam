import test from "node:test";
import assert from "node:assert/strict";
import { HIGGSFIELD_MODELS, buildBody, parseStatus } from "@/core/providers/higgsfield";
import { ProviderError } from "@/core/providers/types";

const req = { prompt: { positive: "a seamless dolly from the cup into the ocean", negative: null }, aspectRatio: "9:16" as const };

test("Higgsfield DoP requests carry both boundary frames with the OpenAPI field names", () => {
  const dop = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:dop-lite")!;
  assert.deepEqual(buildBody(dop, req, "https://cdn/a.jpg", "https://cdn/b.jpg"), {
    prompt: req.prompt.positive, image_url: "https://cdn/a.jpg", end_image_url: "https://cdn/b.jpg", enhance_prompt: false,
  });
});

test("Veo 3.1 first-last-frame requests use the shortest duration and a supported aspect ratio", () => {
  const veo = HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:veo3.1-fast-flf")!;
  const body = buildBody(veo, req, "https://cdn/a.jpg", "https://cdn/b.jpg");
  assert.equal(body.first_frame_url, "https://cdn/a.jpg");
  assert.equal(body.last_frame_url, "https://cdn/b.jpg");
  assert.equal(body.duration, "4");
  assert.equal(body.aspect_ratio, "9:16");
  assert.equal(buildBody(veo, { ...req, aspectRatio: "1:1" }, "a", "b").aspect_ratio, "16:9");
  assert.ok(HIGGSFIELD_MODELS.every((m) => m.supportsLastFrame), "every Higgsfield model is a true bridge model");
});

test("status polling resolves completed videos and types the failure modes", () => {
  assert.equal(parseStatus({ status: "queued" }), null);
  assert.equal(parseStatus({ status: "in_progress" }), null);
  assert.deepEqual(parseStatus({ status: "completed", video: { url: "https://cdn/out.mp4" } }), { url: "https://cdn/out.mp4" });
  assert.throws(() => parseStatus({ status: "failed", error: "boom" }), (e: unknown) => e instanceof ProviderError && e.retryable);
  assert.throws(() => parseStatus({ status: "nsfw" }), (e: unknown) => e instanceof ProviderError && !e.retryable);
  assert.throws(() => parseStatus({ status: "completed", video: null }), ProviderError);
});
