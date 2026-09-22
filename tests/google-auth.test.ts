import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-google-"));
process.env.SEAM_DATA_DIR = dir;
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secret";
const { db } = await import("@/db/client");
const { Sessions, Users } = await import("@/db/repo");
const { accountForGoogle, decodeFlow, encodeFlow, googleAuthUrl, startGoogleFlow, verifyIdTokenClaims } = await import("@/lib/server/google");
const { hashPassword } = await import("@/lib/server/auth");
const { safeNext } = await import("@/lib/safe-next");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

const CLIENT = process.env.GOOGLE_CLIENT_ID!;
const NOW = 1_800_000_000;
function idToken(claims: Record<string, unknown>) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc({ iss: "https://accounts.google.com", aud: CLIENT, azp: CLIENT, exp: NOW + 600, nonce: "n1", sub: "g-1", email: "Ada@Example.com", email_verified: true, ...claims })}.sig`;
}

test("ID token claims are checked: issuer, audience, expiry, nonce and a verified email", () => {
  assert.deepEqual(verifyIdTokenClaims(idToken({}), { clientId: CLIENT, nonce: "n1", nowSec: NOW }), { sub: "g-1", email: "ada@example.com" });
  const bad: [Record<string, unknown>, string][] = [
    [{ iss: "https://evil.example" }, "wrong issuer"], [{ aud: "other" }, "wrong audience"], [{ azp: "other" }, "wrong audience"],
    [{ exp: NOW - 3600 }, "expired"], [{ nonce: "n2" }, "nonce mismatch"], [{ email_verified: false }, "unverified email"], [{ sub: "" }, "missing subject"],
  ];
  for (const [claims, reason] of bad) assert.throws(() => verifyIdTokenClaims(idToken(claims), { clientId: CLIENT, nonce: "n1", nowSec: NOW }), new RegExp(reason));
  assert.throws(() => verifyIdTokenClaims("not-a-jwt", { clientId: CLIENT, nonce: "n1", nowSec: NOW }), /malformed/);
});

test("the authorization request carries state, nonce and an S256 PKCE challenge; the flow cookie round-trips", () => {
  const { flow, challenge } = startGoogleFlow("/library?x=1");
  assert.equal(challenge, createHash("sha256").update(flow.verifier).digest("base64url"));
  const u = new URL(googleAuthUrl(flow, challenge, "https://seamcut.onrender.com/api/auth/google/callback"));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k, v] of Object.entries({ client_id: CLIENT, state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: "S256", scope: "openid email profile", response_type: "code" })) {
    assert.equal(u.searchParams.get(k), v, k);
  }
  assert.deepEqual(decodeFlow(encodeFlow(flow)), flow);
  assert.equal(decodeFlow("garbage"), null);
  assert.equal(startGoogleFlow("https://evil.example").flow.next, "/create");
});

test("safeNext only allows same-site paths", () => {
  assert.equal(safeNext("/library"), "/library");
  for (const v of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "library"]) assert.equal(safeNext(v), "/create");
});

test("a new Google identity creates a confirmed, password-less account with the trial credits", () => {
  const { user, created } = accountForGoogle({ sub: "g-new", email: "new@example.com" });
  assert.equal(created, true);
  assert.equal(user.email, "new@example.com");
  assert.equal(user.passwordHash, null);
  assert.ok(user.emailVerifiedAt);
  assert.equal(accountForGoogle({ sub: "g-new", email: "new@example.com" }).user.id, user.id, "second sign-in finds the same account");
});

test("an existing confirmed email account is linked and keeps its password", () => {
  const u = Users.createAccount("kept@example.com", hashPassword("correct horse"));
  Users.update(u.id, { emailVerifiedAt: new Date().toISOString() });
  const { user, created } = accountForGoogle({ sub: "g-kept", email: "kept@example.com" });
  assert.equal(created, false);
  assert.equal(user.id, u.id);
  assert.equal(user.googleSub, "g-kept");
  assert.equal(user.passwordHash, u.passwordHash);
});

test("an unconfirmed email account is taken over by the verified Google owner: password and sessions are dropped", () => {
  const squatter = Users.createAccount("victim@example.com", hashPassword("attacker-pass"));
  Sessions.create(squatter.id);
  const { user } = accountForGoogle({ sub: "g-victim", email: "victim@example.com" });
  assert.equal(user.id, squatter.id);
  assert.equal(user.passwordHash, null);
  assert.ok(user.emailVerifiedAt);
  const left = db().prepare("SELECT COUNT(*) n FROM sessions WHERE userId=?").get(squatter.id) as { n: number };
  assert.equal(left.n, 0);
});

test("an email already linked to a different Google account is refused", () => {
  accountForGoogle({ sub: "g-first", email: "twice@example.com" });
  assert.throws(() => accountForGoogle({ sub: "g-second", email: "twice@example.com" }), /linked to another Google account/);
});
