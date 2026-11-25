export const MUG = { title: "Caneca branca personalizada 11 oz", width: 12, height: 12, length: 12, weight: 0.45 } as const;

export type ShippingQuote = {
  id: string;
  name: string;
  company: string;
  priceCents: number;
  minDays: number | null;
  maxDays: number | null;
  mode: "live" | "demo";
  pickup?: boolean;
};

export function unitPriceCents() {
  const configured = Number(process.env.MUG_UNIT_PRICE_CENTS);
  return Number.isInteger(configured) && configured > 0 ? configured : 1990;
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function onlyDigits(value: unknown, max = 20) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, max) : "";
}

export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function safeOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    token: row.publicToken,
    status: row.status,
    paymentStatus: row.paymentStatus,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    subtotalCents: row.subtotalCents,
    shippingPriceCents: row.shippingPriceCents,
    totalCents: row.totalCents,
    shippingServiceName: row.shippingServiceName,
    shippingCompany: row.shippingCompany,
    shippingMinDays: row.shippingMinDays,
    shippingMaxDays: row.shippingMaxDays,
    checkoutUrl: row.checkoutUrl,
    trackingCode: row.trackingCode,
    trackingUrl: row.trackingUrl,
    mode: row.mode,
    createdAt: row.createdAt,
  };
}
