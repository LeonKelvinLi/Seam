/**
 * Which Higgsfield bridge models this key can use, at no cost: a request with none of the required fields gets a
 * validation error from an enabled model and 404 model_not_found from one the account cannot use.
 *
 *   npx tsx scripts/probe-higgsfield.ts
 */
import "./_env";
import { config } from "@/core/config";
import { authHeader, HIGGSFIELD_BASE, HIGGSFIELD_MODELS, HIGGSFIELD_NOT_ENABLED } from "@/core/providers/higgsfield";

async function main() {
  if (!config.providers.higgsfieldKeyId || !config.providers.higgsfieldKeySecret) throw new Error("HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET are not set");
  for (const [group, models] of [["routed", HIGGSFIELD_MODELS], ["not routed", HIGGSFIELD_NOT_ENABLED]] as const) {
    for (const m of models) {
      const res = await fetch(`${HIGGSFIELD_BASE}${m.endpoint}`, { method: "POST", headers: { Authorization: authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ probe: true }) });
      const body = (await res.text()).replace(/\s+/g, " ").slice(0, 90);
      const verdict = res.status === 404 ? "NOT ENABLED" : res.status === 400 || res.status === 422 ? "enabled" : `status ${res.status}`;
      console.log(`${verdict.padEnd(12)} ${group.padEnd(11)} ${m.id.padEnd(30)} ${body}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
