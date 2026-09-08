import test from "node:test";
import assert from "node:assert/strict";
import { _resetCooldownsForTests, coolingDownProviders, isBillingError, markProviderUnavailable, providerCoolingDown } from "@/core/providers/cooldown";

test("billing failures are recognised and park the provider for the cooldown window only", () => {
  _resetCooldownsForTests();
  assert.equal(isBillingError('higgsfield 403: {"detail":"not_enough_credits"}'), true);
  assert.equal(isBillingError("fal 403: User is locked. Reason: Exhausted balance."), true);
  assert.equal(isBillingError("runway 400: Validation of body failed"), false);
  markProviderUnavailable("higgsfield", 1000, 0);
  assert.equal(providerCoolingDown("higgsfield", 500), true);
  assert.deepEqual(coolingDownProviders(500), ["higgsfield"]);
  assert.equal(providerCoolingDown("fal", 500), false);
  assert.equal(providerCoolingDown("higgsfield", 1001), false, "expired cooldowns clear themselves");
  markProviderUnavailable("local", 1000, 0);
  assert.equal(providerCoolingDown("local", 500), false, "ffmpeg is never parked");
});
