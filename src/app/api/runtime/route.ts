import { json } from "@/lib/server/session";
import { describeRuntime } from "@/core/config";

export async function GET() {
  return json(describeRuntime());
}
