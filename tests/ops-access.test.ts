import { test } from "node:test";
import assert from "node:assert/strict";
import { opsAccessAllowed } from "@/lib/server/ops-access";

test("production ops fail closed when the token is unset, blank, absent, or wrong", () => {
  assert.equal(opsAccessAllowed(null, { NODE_ENV: "production" }), false);
  assert.equal(opsAccessAllowed("Bearer unit-test", { NODE_ENV: "production" }), false);
  assert.equal(opsAccessAllowed("Bearer unit-test", { NODE_ENV: "production", SEAM_OPS_TOKEN: "  " }), false);
  const env = { NODE_ENV: "production", SEAM_OPS_TOKEN: "unit-test" };
  for (const header of [null, "unit-test", "Basic unit-test", "Bearer", "Bearer wrong-key", "Bearer unit-test extra", "Bearer unit-test,Bearer unit-test"]) {
    assert.equal(opsAccessAllowed(header, env), false, String(header));
  }
  assert.equal(opsAccessAllowed("Bearer unit-test", env), true);
  assert.equal(opsAccessAllowed("bearer unit-test", env), true);
});

test("development ops remain available without an admin token", () => {
  assert.equal(opsAccessAllowed(null, { NODE_ENV: "development" }), true);
  assert.equal(opsAccessAllowed(null, { NODE_ENV: "test" }), true);
});
