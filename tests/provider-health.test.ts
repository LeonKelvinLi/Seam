import { test } from "node:test";
import assert from "node:assert/strict";
import { createBalanceMonitor } from "@/lib/server/provider-health";
test("balance monitor caches calls but expires success and alerts on unavailable data", async () => {
  process.env.FAL_KEY = "test-only";
  let now = 0, calls = 0;
  const responses = [{ credits: { current_balance: 40, currency: "USD" } }, { credits: { current_balance: 0.52, currency: "USD" } }, {}];
  const monitor = createBalanceMonitor((async () => { calls++; return Response.json(responses.shift()); }) as typeof fetch, () => now);
  assert.equal((await monitor()).state, "ready");
  assert.equal((await monitor()).balanceUsd, 40);
  assert.equal(calls, 1);
  now += 61_000;
  assert.equal((await monitor()).state, "low");
  now += 61_000;
  const status = await monitor();
  assert.equal(status.state, "unknown");
  assert.equal(status.ok, false);
  assert.equal(status.balanceUsd, null);
});
test("403 and network failure are unknown, never zero", async () => {
  process.env.FAL_KEY = "test-only";
  for (const fetcher of [async () => new Response(null, { status: 403 }), async () => { throw new Error("offline"); }]) {
    const status = await createBalanceMonitor(fetcher as typeof fetch)();
    assert.equal(status.state, "unknown"); assert.equal(status.balanceUsd, null);
  }
});
test("an ordinary key refused by the account API reads its balance from the key-scoped endpoint", async () => {
  process.env.FAL_KEY = "test-only";
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(url);
    return url.includes("user_balance") ? new Response("8.17") : new Response(null, { status: 403 });
  }) as unknown as typeof fetch;
  const status = await createBalanceMonitor(fetcher)();
  assert.equal(urls.length, 2);
  assert.equal(status.balanceUsd, 8.17);
  assert.equal(status.state, "low", "below the default $15 warning line");
});
