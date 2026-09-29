import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { higgsfieldProvider, HIGGSFIELD_MODELS } from "@/core/providers/higgsfield";
import { ProviderError, ProviderOutcomeUnknownError, type TransitionRequest } from "@/core/providers/types";
import { getRecipe } from "@/core/recipes/registry";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "x-correlation-id": "correlation-test" },
});

async function harness(t: TestContext, submit: () => Promise<Response>, status = async () => json({ status: "completed", video: { url: "https://cdn.test/result.mp4" } })) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipmelt-higgsfield-"));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const frame = path.join(dir, "frame.jpg");
  await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).jpeg().toFile(frame);
  const receipts: unknown[] = [];
  let submissions = 0, reads = 0;
  const req: TransitionRequest = {
    firstFramePath: frame, lastFramePath: frame, outputPath: path.join(dir, "out.mp4"),
    prompt: { positive: "orbit around the subject", negative: null }, durationSec: 2, aspectRatio: "16:9",
    transitionType: "orbit", motionStrength: 0.5,
    local: { spec: { width: 320, height: 180, fps: 30 }, recipe: getRecipe("orbit"), focusA: { x: 0.5, y: 0.5 }, focusB: { x: 0.5, y: 0.5 } },
    onSubmission: (receipt) => receipts.push(receipt),
  };
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.endsWith("/files/generate-upload-url")) return json({ upload_url: "https://upload.test/frame", public_url: "https://cdn.test/frame.jpg" });
    if (endpoint === "https://upload.test/frame") return new Response(null, { status: 200 });
    if (endpoint.includes("/higgsfield-ai/dop/")) {
      submissions++;
      assert.equal(init?.method, "POST");
      assert.deepEqual(receipts[0], { state: "submitting" }, "intent is recorded before the paid request");
      return submit();
    }
    if (endpoint.endsWith("/requests/provider-job/status")) {
      reads++;
      assert.equal(init?.method, "GET");
      assert.deepEqual(receipts[1], { state: "submitted", requestId: "provider-job", correlationId: "correlation-test" });
      return status();
    }
    if (endpoint === "https://cdn.test/result.mp4") return new Response("test video bytes");
    assert.fail(`unexpected network call: ${endpoint}`);
  });
  return { req, run: () => higgsfieldProvider.generateTransition(req, HIGGSFIELD_MODELS.find((m) => m.id === "higgsfield:dop-lite")!), counts: () => ({ submissions, reads }) };
}

for (const [label, submit] of [
  ["network timeout", async () => { throw new DOMException("Timed out", "TimeoutError"); }],
  ["HTTP 502", async () => json({}, 502)],
  ["HTTP 408", async () => json({}, 408)],
  ["unreadable response", async () => new Response("truncated JSON", { headers: { "x-correlation-id": "correlation-test" } })],
  ["missing request ID", async () => json({ status: "queued" })],
] as const) {
  test(`Higgsfield ${label} never repeats the generation POST`, async (t) => {
    const h = await harness(t, submit);
    await assert.rejects(h.run(), (e: unknown) => e instanceof ProviderOutcomeUnknownError && !e.retryable);
    assert.deepEqual(h.counts(), { submissions: 1, reads: 0 });
  });
}

test("Higgsfield validation rejection is a definite error, not an uncertain paid submission", async (t) => {
  const h = await harness(t, async () => json({ detail: "invalid input" }, 422));
  await assert.rejects(h.run(), (e: unknown) => e instanceof ProviderError && !(e instanceof ProviderOutcomeUnknownError) && !e.retryable);
  assert.equal(h.counts().submissions, 1);
});

test("Higgsfield retries transient status reads and recovers the existing job", async (t) => {
  let calls = 0;
  const h = await harness(t, async () => json({ request_id: "provider-job" }), async () => {
    calls++;
    if (calls === 1) throw new Error("connection reset");
    if (calls === 2) return json({}, 503);
    return json({ status: "completed", video: { url: "https://cdn.test/result.mp4" } });
  });
  const result = await h.run();
  assert.equal(result.providerJobId, "provider-job");
  assert.ok(fs.existsSync(result.outputPath));
  assert.deepEqual(h.counts(), { submissions: 1, reads: 3 });
});

test("exhausted polling retains the receipt and stops generation retries", async (t) => {
  const h = await harness(t, async () => json({ request_id: "provider-job" }), async () => json({}, 503));
  await assert.rejects(h.run(), (e: unknown) => e instanceof ProviderOutcomeUnknownError && e.requestId === "provider-job" && e.correlationId === "correlation-test");
  assert.deepEqual(h.counts(), { submissions: 1, reads: 3 });
});

test("a confirmed terminal failure still permits a new attempt", async (t) => {
  const h = await harness(t, async () => json({ request_id: "provider-job" }), async () => json({ status: "failed", error: "render failed" }));
  await assert.rejects(h.run(), (e: unknown) => e instanceof ProviderError && e.retryable && !(e instanceof ProviderOutcomeUnknownError));
  assert.deepEqual(h.counts(), { submissions: 1, reads: 1 });
});

test("completed without recoverable output must not buy another render", async (t) => {
  const h = await harness(t, async () => json({ request_id: "provider-job" }), async () => json({ status: "completed" }));
  await assert.rejects(h.run(), ProviderOutcomeUnknownError);
  assert.deepEqual(h.counts(), { submissions: 1, reads: 1 });
});

test("failure to persist an accepted receipt cannot cause a duplicate submission", async (t) => {
  const h = await harness(t, async () => json({ request_id: "provider-job" }));
  const record = h.req.onSubmission!;
  h.req.onSubmission = (receipt) => {
    record(receipt);
    if (receipt.state === "submitted") throw new Error("database unavailable");
  };
  await assert.rejects(h.run(), (e: unknown) => e instanceof ProviderOutcomeUnknownError && e.requestId === "provider-job");
  assert.deepEqual(h.counts(), { submissions: 1, reads: 0 });
});
