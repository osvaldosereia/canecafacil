import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { siteContent } from "../../../../db/schema";
import { getAdminAccess } from "../../../../lib/admin-auth";
import { normalizeSiteContent } from "../../../../lib/capineca-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  const db = await getDb();
  const [record] = await db.select().from(siteContent).where(eq(siteContent.key, "published")).limit(1);
  const content = record ? normalizeSiteContent(JSON.parse(record.value)) : normalizeSiteContent(null);
  return Response.json({ content }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  const content = normalizeSiteContent(body);
  await ensureDatabase();
  const db = await getDb();
  await db.insert(siteContent).values({ key: "published", value: JSON.stringify(content), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: siteContent.key, set: { value: JSON.stringify(content), updatedAt: new Date().toISOString() } });
  return Response.json({ content, saved: true }, { headers: { "cache-control": "no-store" } });
}
