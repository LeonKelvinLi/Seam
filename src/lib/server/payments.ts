import { PACKS, billingStatus, checkoutUrl } from "@/lib/server/billing";
import { brazilPriceCents, mercadoPagoCheckout, mercadoPagoConfigured } from "@/lib/server/mercadopago";

export const paymentProvider = () => (process.env.SEAM_PAYMENT_PROVIDER ?? "stripe").trim();
export function paymentPacks() {
  const brazil = paymentProvider() === "mercadopago";
  return PACKS.map(p => {
    const amount = brazilPriceCents(p.id);
    return { ...p, currency: brazil ? "BRL" : "USD", priceAmount: brazil ? (amount === null ? null : amount / 100) : p.priceUsd };
  });
}
export function paymentStatus() {
  const provider = paymentProvider();
  if (provider === "mercadopago") return { provider, checkout: mercadoPagoConfigured(), links: [], webhook: !!process.env.MP_WEBHOOK_SECRET?.trim() };
  if (provider !== "stripe") return { provider: "unavailable", checkout: false, links: [], webhook: false };
  return { provider, ...billingStatus() };
}
export async function paymentCheckout(userId: string, email: string | null, pack: string, req: Request) {
  if (paymentProvider() === "mercadopago") return mercadoPagoCheckout(userId, pack);
  if (paymentProvider() !== "stripe") return null;
  return checkoutUrl(userId, email, pack, req);
}
