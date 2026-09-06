import { json } from "@/lib/server/session";
import { computeMetrics } from "@/core/observability/metrics";
import { opsAccessAllowed } from "@/lib/server/ops-access";

export async function GET(req: Request) {
  if (!opsAccessAllowed(req.headers.get("authorization"))) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return json(computeMetrics(), { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
