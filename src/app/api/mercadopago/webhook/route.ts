import { mercadoPagoWebhook } from "@/lib/server/mercadopago";

export async function POST(req: Request) {
  try {
    const result = await mercadoPagoWebhook(req);
    return Response.json({ received: result.ok }, { status: result.ok ? 200 : 400 });
  } catch {
    // No acknowledgement until the API lookup and atomic receipt commit succeeded; provider retries remain safe.
    return Response.json({ received: false }, { status: 503 });
  }
}
