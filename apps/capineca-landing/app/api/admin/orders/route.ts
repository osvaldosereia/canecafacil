import { desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { orders, personalizations } from "../../../../db/schema";
import { getAdminAccess } from "../../../../lib/admin-auth";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  const db = await getDb();
  const [orderRows, generationRows] = await Promise.all([
    db.select({
      id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus, quantity: orders.quantity,
      totalCents: orders.totalCents, shippingPriceCents: orders.shippingPriceCents,
      shippingServiceName: orders.shippingServiceName, shippingCompany: orders.shippingCompany,
      shippingMinDays: orders.shippingMinDays, shippingMaxDays: orders.shippingMaxDays,
      postalCode: orders.postalCode, address: orders.address, addressNumber: orders.addressNumber,
      complement: orders.complement, district: orders.district, city: orders.city, state: orders.state,
      paymentId: orders.paymentId, mode: orders.mode, trackingCode: orders.trackingCode,
      trackingUrl: orders.trackingUrl, adminNotes: orders.adminNotes, createdAt: orders.createdAt, updatedAt: orders.updatedAt,
      personalizationId: personalizations.id, modelTitle: personalizations.modelTitle, artName: personalizations.artName,
      phrase: personalizations.phrase, customerName: personalizations.customerName,
      customerEmail: personalizations.customerEmail, customerPhone: personalizations.customerPhone,
      artImageUrl: personalizations.artImageUrl, mugMockupUrl: personalizations.mugMockupUrl,
    }).from(orders).leftJoin(personalizations, eq(orders.personalizationId, personalizations.id)).orderBy(desc(orders.createdAt)).limit(200),
    db.select({ id: personalizations.id, modelTitle: personalizations.modelTitle, artName: personalizations.artName,
      customerName: personalizations.customerName, status: personalizations.status, mode: personalizations.mode,
      error: personalizations.error, artImageUrl: personalizations.artImageUrl,
      mugMockupUrl: personalizations.mugMockupUrl, createdAt: personalizations.createdAt,
    }).from(personalizations).orderBy(desc(personalizations.createdAt)).limit(100),
  ]);
  return Response.json({ orders: orderRows, generations: generationRows }, { headers: { "cache-control": "no-store" } });
}
