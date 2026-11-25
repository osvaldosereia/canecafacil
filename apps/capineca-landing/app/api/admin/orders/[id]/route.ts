import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../../db";
import { orders } from "../../../../../db/schema";
import { getAdminAccess } from "../../../../../lib/admin-auth";
import { cleanText } from "../../../../../lib/commerce";

const allowedStatuses = new Set(["awaiting_payment", "paid", "awaiting_production", "in_production", "produced", "shipped", "delivered", "cancelled", "refunded"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const body = await request.json() as { status?: string; trackingCode?: string; trackingUrl?: string; adminNotes?: string };
  const status = cleanText(body.status, 40);
  if (!id || !allowedStatuses.has(status)) return Response.json({ error: "Etapa do pedido inválida." }, { status: 400 });
  const trackingCode = cleanText(body.trackingCode, 100);
  const trackingUrl = cleanText(body.trackingUrl, 600);
  if (trackingUrl) { try { const url = new URL(trackingUrl); if (url.protocol !== "https:") throw new Error(); } catch { return Response.json({ error: "Informe um link de rastreio HTTPS válido." }, { status: 400 }); } }
  await ensureDatabase();
  const db = await getDb();
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  const [updated] = await db.update(orders).set({
    status,
    paymentStatus: status === "paid" && existing.mode === "demo" ? "approved_manual" : existing.paymentStatus,
    paymentId: status === "paid" && existing.mode === "demo" && !existing.paymentId ? "manual" : existing.paymentId,
    trackingCode,
    trackingUrl,
    adminNotes: cleanText(body.adminNotes, 1200),
    updatedAt: new Date().toISOString(),
  }).where(eq(orders.id, id)).returning();
  return Response.json({ order: updated });
}
