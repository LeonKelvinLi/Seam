#!/usr/bin/env node
/**
 * Push secrets from the local .env.local to the Render service and redeploy, without ever printing a value.
 *
 *   node scripts/push-secrets.mjs            # dry run: shows which keys would be sent
 *   node scripts/push-secrets.mjs --apply    # upserts them on Render and starts a deploy
 *
 * Needs RENDER_API_KEY (Render → Account settings → API keys) and RENDER_SERVICE_ID in .env.local.
 */
import fs from "node:fs";
import path from "node:path";

const KEYS = [
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET",
  "FAL_KEY", "RUNWAYML_API_SECRET", "OPENAI_API_KEY",
  "RESEND_API_KEY", "SEAM_MAIL_FROM",
  "SEAM_COMPANY_NAME", "SEAM_COMPANY_ADDRESS", "SEAM_SUPPORT_EMAIL",
  "SEAM_PUBLIC_URL", "SEAM_OPS_TOKEN",
];
const apply = process.argv.includes("--apply");
const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) { console.error("No .env.local found next to package.json."); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")]; }),
);
const present = KEYS.filter((k) => env[k]);
const missing = KEYS.filter((k) => !env[k]);
console.log(`Keys set locally (${present.length}): ${present.join(", ") || "none"}`);
if (missing.length) console.log(`Not set locally (skipped): ${missing.join(", ")}`);

const token = env.RENDER_API_KEY, service = env.RENDER_SERVICE_ID || "srv-daeromf40ujc738ft0t0";
if (!apply) { console.log(`\nDry run. Add --apply to push to Render service ${service}.${token ? "" : " RENDER_API_KEY is not set yet."}`); process.exit(0); }
if (!token) { console.error("RENDER_API_KEY is missing from .env.local."); process.exit(1); }
if (!present.length) { console.error("Nothing to push."); process.exit(1); }

const api = async (method, p, body) => {
  const res = await fetch(`https://api.render.com/v1${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
};

for (const key of present) {
  await api("PUT", `/services/${service}/env-vars/${key}`, { value: env[key] });
  console.log(`  set ${key}`);
}
const deploy = await api("POST", `/services/${service}/deploys`, { clearCache: "do_not_clear" });
console.log(`Deploy started: ${deploy?.id ?? "ok"}. Watch it at https://dashboard.render.com/web/${service}`);
