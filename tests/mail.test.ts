import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-mail-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Users } = await import("@/db/repo");
const { sendMail, mailConfigured } = await import("@/lib/server/mail");
const { POST: forgotPassword } = await import("@/app/api/auth/forgot/route");
const { _resetForTests } = await import("@/lib/server/ratelimit");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

function setMailEnv(t: { after: (fn: () => void) => void }, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const apply = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(values);
  t.after(() => apply(previous));
}

test("production mail failures never log recipients, recovery tokens, or provider response bodies", async (t) => {
  setMailEnv(t, { NODE_ENV: "production", RESEND_API_KEY: " ", SEAM_MAIL_FROM: "SeamCut <support@example.com>" });
  const logs: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => logs.push(args.join(" ")));
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args.join(" ")));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("provider echoed private-reset-token", { status: 403 }); });
  const message = { to: "private-recipient@example.com", subject: "Reset password", text: "https://example.com/reset?token=private-reset-token" };

  assert.equal(mailConfigured(), false, "blank credentials are unavailable");
  assert.deepEqual(await sendMail(message), { sent: false });
  assert.equal(calls, 0);
  process.env.RESEND_API_KEY = "test-key";
  assert.deepEqual(await sendMail(message), { sent: false });
  assert.equal(calls, 1);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(logs.join("\n"), /private-recipient|private-reset-token|provider echoed|https:/);
});

test("password recovery reports configuration equally for existing and missing accounts, including provider failure", async (t) => {
  setMailEnv(t, { NODE_ENV: "production", RESEND_API_KEY: undefined, SEAM_MAIL_FROM: undefined });
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  const user = Users.createAccount("mail-test@example.com", "unused-test-hash");
  const emails = [user.email!, "unknown-mail-test@example.com"];
  let scenario: "accepted" | "rejected" | "network" = "accepted";
  let sentRequests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    sentRequests++;
    if (scenario === "network") throw new Error("provider connection failed");
    return scenario === "accepted" ? Response.json({ id: "mail-test-id" }) : new Response("unavailable", { status: 503 });
  });
  const responses = async () => {
    _resetForTests();
    const result = [];
    for (const email of emails) {
      const response = await forgotPassword(new Request("https://example.com/api/auth/forgot", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
      }));
      result.push({ status: response.status, body: await response.json() });
    }
    return result;
  };

  assert.deepEqual(await responses(), emails.map(() => ({ status: 200, body: { ok: true, delivery: "unavailable" } })));
  assert.equal(sentRequests, 0);
  process.env.RESEND_API_KEY = "test-key";
  process.env.SEAM_MAIL_FROM = "support@example.com";
  for (scenario of ["accepted", "rejected", "network"] as const) {
    assert.deepEqual(await responses(), emails.map(() => ({ status: 200, body: { ok: true, delivery: "configured" } })), scenario);
  }
  assert.equal(sentRequests, 3, "mail is attempted only for an existing account");
});
