import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-attr-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Events, Purchases, Users } = await import("@/db/repo");
const { computeMetrics } = await import("@/core/observability/metrics");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("the first touch is kept, never overwritten, and survives a guest signing in", () => {
  const guest = Users.ensure("usr_guestaaaaaaa");
  Users.setFirstTouch(guest.id, { source: "tiktok", utm_campaign: "launch", utm_content: "creativeB", landing: "/" });
  Users.setFirstTouch(guest.id, { source: "x" });
  assert.equal(Users.get(guest.id)?.firstTouch?.source, "tiktok");
  const account = Users.createAccount("buyer@example.com", "scrypt$x$y");
  Users.adopt(guest.id, account.id);
  assert.equal(Users.get(account.id)?.firstTouch?.utm_content, "creativeB");
});

test("the campaign funnel counts each visitor once per step and sums purchases", () => {
  const touch = { source: "tiktok", utm_campaign: "launch", utm_content: "creativeC" };
  const ids = ["usr_aaaaaaaaaaa1", "usr_aaaaaaaaaaa2", "usr_aaaaaaaaaaa3"];
  for (const id of ids) { Users.ensure(id); Users.setFirstTouch(id, touch); Events.track("visit", { userId: id }); }
  Events.track("upload_completed", { userId: ids[0] });
  Events.track("upload_completed", { userId: ids[0] });
  Events.track("upload_completed", { userId: ids[1] });
  Events.track("generation_succeeded", { userId: ids[0] });
  Events.track("purchase", { userId: ids[0] });
  Purchases.record({ userId: ids[0], provider: "stripe", externalId: "cs_attr_1", pack: "starter", amountCents: 900, currency: "usd", credits: 12 });
  const row = (computeMetrics().byCampaign as Record<string, unknown>[]).find((r) => r.content === "creativeC");
  assert.ok(row, "campaign row present");
  assert.equal(row.visitors, 3);
  assert.equal(row.uploads, 2);
  assert.equal(row.generated, 1);
  assert.equal(row.buyers, 1);
  assert.equal(row.revenueCents, 900);
});
