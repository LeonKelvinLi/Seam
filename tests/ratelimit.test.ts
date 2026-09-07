import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, _resetForTests } from "../src/lib/server/ratelimit";

test("rate limiter allows up to max hits in the window then blocks with a retry-after", () => {
  _resetForTests();
  const limit = { max: 3, windowMs: 1000 };
  assert.equal(rateLimit("k", limit, 0).ok, true);
  assert.equal(rateLimit("k", limit, 10).ok, true);
  assert.equal(rateLimit("k", limit, 20).ok, true);
  const blocked = rateLimit("k", limit, 30);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 1);
  // The window slides: after the first hit ages out, one more is allowed.
  assert.equal(rateLimit("k", limit, 1001).ok, true);
  // Keys are independent.
  assert.equal(rateLimit("other", limit, 1001).ok, true);
});
