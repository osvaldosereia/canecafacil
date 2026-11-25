import { getShippingQuotes } from "../../../../lib/shipping";
import { unitPriceCents } from "../../../../lib/commerce";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { postalCode?: string; quantity?: number };
    const result = await getShippingQuotes(body.postalCode, body.quantity);
    return Response.json({ ...result, unitPriceCents: unitPriceCents() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular o frete." }, { status: 400 });
  }
}
