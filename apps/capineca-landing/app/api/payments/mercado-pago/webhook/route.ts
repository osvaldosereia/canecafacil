import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../../db";
import { orders } from "../../../../../db/schema";

function fromHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)));
}

async function validSignature(request: Request, dataId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map(item => item.trim().split("=", 2)));
  const ts = parts.ts;
  const v1 = parts.v1;
  const bytes = fromHex(v1 || "");
  if (!ts || !bytes) return false;
  const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(manifest));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { type?: string; data?: { id?: string | number } };
    const url = new URL(request.url);
    const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? "");
    if (!dataId || !(await validSignature(request, dataId))) return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    if (body.type && body.type !== "payment") return Response.json({ ok: true, ignored: true });
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!accessToken) return Response.json({ error: "Pagamento não configurado." }, { status: 503 });
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!paymentResponse.ok) return Response.json({ error: "Pagamento não encontrado." }, { status: 404 });
    const payment = await paymentResponse.json() as { id?: number | string; status?: string; external_reference?: string; transaction_amount?: number; currency_id?: string };
    const orderId = String(payment.external_reference ?? "");
    if (!orderId) return Response.json({ ok: true, ignored: true });
    await ensureDatabase();
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return Response.json({ ok: true, ignored: true });
    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    if (payment.currency_id !== "BRL" || paidCents !== order.totalCents) return Response.json({ ok: true, ignored: "amount_mismatch" });
    const paymentStatus = payment.status || "pending";
    const orderStatus = paymentStatus === "approved" ? "paid" : paymentStatus === "refunded" ? "refunded" : paymentStatus === "cancelled" ? "cancelled" : paymentStatus === "rejected" ? "payment_rejected" : "awaiting_payment";
    await db.update(orders).set({ status: orderStatus, paymentStatus, paymentId: String(payment.id ?? dataId), updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Falha ao processar a notificação." }, { status: 500 });
  }
}
