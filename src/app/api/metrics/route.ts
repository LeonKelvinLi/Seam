import { json } from "@/lib/server/session";
import { computeMetrics } from "@/core/observability/metrics";

export async function GET() {
  return json(computeMetrics());
}
