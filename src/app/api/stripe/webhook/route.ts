import { handleWebhook } from "@/lib/server/billing";

export async function POST(req: Request) {
  const raw = await req.text();
  const result = handleWebhook(raw, req.headers.get("stripe-signature"));
  return Response.json({ received: result.ok, message: result.message }, { status: result.ok ? 200 : 400 });
}
