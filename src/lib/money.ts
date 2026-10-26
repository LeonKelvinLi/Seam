export interface DisplayPack {
  id: string; name: string; credits: number; priceAmount: number | null; currency: string; blurb: string;
}

export function formatPackPrice(pack: Pick<DisplayPack, "priceAmount" | "currency">) {
  if (pack.priceAmount === null) return "Price unavailable";
  return new Intl.NumberFormat(pack.currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency", currency: pack.currency, minimumFractionDigits: pack.currency === "BRL" ? 2 : 0, maximumFractionDigits: 2,
  }).format(pack.priceAmount);
}
