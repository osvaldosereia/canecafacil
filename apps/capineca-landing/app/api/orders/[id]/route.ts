import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { safeOrder } from "../../../../lib/commerce";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!id || !token) return Response.json({ error: "Consulta inválida." }, { status: 400 });
  await ensureDatabase();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.publicToken, token))).limit(1);
  if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  return Response.json(safeOrder(order), { headers: { "cache-control": "no-store" } });
}
