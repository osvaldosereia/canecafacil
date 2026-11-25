import { ensureDatabase, getDb } from "../../../../db";
import { b2bLeads } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Não foi possível registrar o orçamento." }, { status: 400 });
  if (clean(body.websiteCheck, 120)) return Response.json({ id: "", accepted: true, ignored: true }, { status: 202 });

  const company = clean(body.company, 100);
  const sector = clean(body.sector, 100);
  const purpose = clean(body.purpose, 100);
  const contactName = clean(body.contactName, 100);
  const contactPhone = clean(body.contactPhone, 30);
  const quantity = Number(body.quantity);
  if (!company || !sector || !purpose || !contactName || !contactPhone || !Number.isInteger(quantity) || quantity < 10 || quantity > 10000) {
    return Response.json({ error: "Confira os dados obrigatórios e a quantidade mínima de 10 canecas." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await ensureDatabase();
  const db = await getDb();
  await db.insert(b2bLeads).values({
    id, company, sector, purpose, quantity,
    city: clean(body.city, 80), businessPhone: clean(body.businessPhone, 30), website: clean(body.businessWebsite, 180),
    customizationIdea: clean(body.customizationIdea, 500), contactName, contactPhone,
  });
  return Response.json({ id, accepted: true }, { status: 201, headers: { "cache-control": "no-store" } });
}
