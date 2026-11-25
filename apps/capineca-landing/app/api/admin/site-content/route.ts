import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { siteContent } from "../../../../db/schema";
import { getAdminAccess } from "../../../../lib/admin-auth";
import { normalizeSiteContent, type CapinecaSiteContent } from "../../../../lib/capineca-content";

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
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  await ensureDatabase();
  const db = await getDb();
  let content: CapinecaSiteContent;
  const payload = body as Record<string, unknown>;
  if ("imageUpdate" in payload) {
    const update = payload.imageUpdate;
    if (!update || typeof update !== "object" || Array.isArray(update)) return Response.json({ error: "Atualização da imagem inválida." }, { status: 400 });
    const image = update as Record<string, unknown>;
    const slot = image.slot;
    const url = typeof image.url === "string" ? image.url.trim() : "";
    if (!url || url.length > 500 || !["hero", "showcase"].includes(String(slot))) return Response.json({ error: "Informe uma imagem válida para publicar." }, { status: 400 });
    const [record] = await db.select().from(siteContent).where(eq(siteContent.key, "published")).limit(1);
    const current = record ? normalizeSiteContent(JSON.parse(record.value)) : normalizeSiteContent(null);
    if (slot === "hero") {
      content = normalizeSiteContent({ ...current, heroImage: url });
      if (content.heroImage !== url) return Response.json({ error: "O endereço da imagem precisa ser HTTPS público." }, { status: 400 });
    } else {
      const index = Number(image.index);
      if (!Number.isInteger(index) || index < 0 || index >= current.portfolio.length) return Response.json({ error: "Selecione um modelo válido da vitrine." }, { status: 400 });
      const portfolio = current.portfolio.map((sample, sampleIndex) => sampleIndex === index ? { ...sample, imageUrl: url } : sample);
      content = normalizeSiteContent({ ...current, portfolio });
      if (content.portfolio[index].imageUrl !== url) return Response.json({ error: "O endereço da imagem precisa ser HTTPS público." }, { status: 400 });
    }
  } else {
    content = normalizeSiteContent(payload);
  }
  await db.insert(siteContent).values({ key: "published", value: JSON.stringify(content), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: siteContent.key, set: { value: JSON.stringify(content), updatedAt: new Date().toISOString() } });
  return Response.json({ content, saved: true }, { headers: { "cache-control": "no-store" } });
}
