import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-free-runs-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { FreeRuns, Purchases, Users } = await import("@/db/repo");
const { FREE_RUNS_PER_NETWORK_PER_DAY, freeRunKey, networkKey, networkLimitReached, networkOf } = await import("@/lib/server/free-runs");
const { clientIp } = await import("@/lib/server/ratelimit");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("the client address comes from the edge header, not the forgeable X-Forwarded-For", () => {
  const req = (h: Record<string, string>) => new Request("https://clipmelt.com/", { headers: h });
  assert.equal(clientIp(req({ "true-client-ip": "198.51.100.4", "x-forwarded-for": "203.0.113.7, 198.51.100.4" })), "198.51.100.4");
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7", "local fallback without an edge");
});

test("IPv6 addresses in the same /64 are one network; IPv4 is per address", () => {
  assert.equal(networkOf("2001:db8:1:2:aaaa::1"), networkOf("2001:0db8:0001:0002:ffff:1:2:3"));
  assert.notEqual(networkOf("2001:db8:1:2::1"), networkOf("2001:db8:1:3::1"));
  assert.equal(networkOf("::ffff:198.51.100.4"), "198.51.100.4");
  assert.notEqual(networkKey("198.51.100.4", "2026-09-24"), networkKey("198.51.100.4", "2026-09-25"), "keys change daily");
});

test("free runs are capped per network, paid and Google accounts are not, and a released run frees its slot", () => {
  const ip = "198.51.100.9";
  const guests = Array.from({ length: FREE_RUNS_PER_NETWORK_PER_DAY + 1 }, (_, i) => Users.ensure(`usr_netguest${String(i).padStart(4, "0")}`));
  const key = freeRunKey(guests[0].id, ip)!;
  for (let i = 0; i < FREE_RUNS_PER_NETWORK_PER_DAY; i++) { assert.equal(networkLimitReached(key), false); FreeRuns.record(`gen_net${i}`, key); }
  assert.equal(networkLimitReached(freeRunKey(guests.at(-1)!.id, ip)!), true, "a fresh guest on the same network is refused");
  FreeRuns.release("gen_net0");
  assert.equal(networkLimitReached(key), false, "a failed run gives the slot back");

  const google = Users.createGoogleAccount("net@example.com", "google-sub-net");
  assert.equal(freeRunKey(google.id, ip), null);
  const buyer = Users.ensure("usr_netbuyer0001");
  Purchases.record({ userId: buyer.id, provider: "stripe", externalId: "cs_net_buyer", pack: "starter", amountCents: 900, currency: "usd", credits: 12 });
  assert.equal(freeRunKey(buyer.id, ip), null);
});
