import { MUG, ShippingQuote, onlyDigits, unitPriceCents } from "./commerce";

type MelhorEnvioQuote = {
  id?: number;
  name?: string;
  price?: string;
  custom_price?: string;
  delivery_time?: number;
  custom_delivery_time?: number;
  error?: string;
  company?: { name?: string };
};

export async function getShippingQuotes(postalCodeInput: unknown, quantityInput: unknown): Promise<{ quotes: ShippingQuote[]; mode: "live" | "demo" }> {
  const postalCode = onlyDigits(postalCodeInput, 8);
  const quantity = Math.min(10, Math.max(1, Number(quantityInput) || 1));
  if (postalCode.length !== 8) throw new Error("Informe um CEP válido com 8 números.");

  const pickup: ShippingQuote = { id: "pickup-cuiaba", name: "Retirada em Cuiabá", company: "Retirada local", priceCents: 0, minDays: null, maxDays: null, mode: "live", pickup: true };
  const accessToken = process.env.MELHOR_ENVIO_ACCESS_TOKEN?.trim();
  const originPostalCode = onlyDigits(process.env.STORE_ORIGIN_POSTAL_CODE, 8);
  const supportEmail = process.env.STORE_SUPPORT_EMAIL?.trim();
  const sandbox = process.env.MELHOR_ENVIO_ENV !== "production";

  if (!accessToken || originPostalCode.length !== 8 || !supportEmail) {
    return { mode: "demo", quotes: [pickup, { id: "demo-economico", name: "Econômico", company: "Melhor Envio · demonstração", priceCents: 1890, minDays: 5, maxDays: 9, mode: "demo" }, { id: "demo-expresso", name: "Expresso", company: "Melhor Envio · demonstração", priceCents: 3290, minDays: 2, maxDays: 4, mode: "demo" }] };
  }

  const baseUrl = sandbox ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
  const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${accessToken}`, "user-agent": `Canecas (${supportEmail})` },
    body: JSON.stringify({ from: { postal_code: originPostalCode }, to: { postal_code: postalCode }, products: [{ id: "caneca-11oz", width: MUG.width, height: MUG.height, length: MUG.length, weight: MUG.weight, insurance_value: unitPriceCents() / 100, quantity }], options: { receipt: false, own_hand: false } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("O cálculo de frete está temporariamente indisponível.");
  const result = await response.json() as MelhorEnvioQuote[];
  const liveQuotes = result.filter(item => !item.error && item.id && (item.custom_price || item.price)).map(item => {
    const delivery = Number(item.custom_delivery_time ?? item.delivery_time ?? 0);
    return { id: String(item.id), name: item.name || "Entrega", company: item.company?.name || "Transportadora", priceCents: Math.round(Number(item.custom_price ?? item.price) * 100), minDays: delivery || null, maxDays: delivery || null, mode: "live" as const };
  }).filter(item => Number.isFinite(item.priceCents));
  if (!liveQuotes.length) throw new Error("Nenhuma transportadora atende este CEP agora.");
  return { mode: "live", quotes: [pickup, ...liveQuotes.slice(0, 6)] };
}
