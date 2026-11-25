import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../../db";
import { models } from "../../../../../db/schema";
import { getAdminAccess } from "../../../../../lib/admin-auth";
import { cleanText } from "../../../../../lib/commerce";
import { parseTags } from "../../../../../lib/models";

const statuses = new Set(["review", "published", "inactive", "rejected"]);
const accents = new Set(["coral", "sage", "blue", "lavender", "rose", "coffee"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const modelId = Number(id);
  const body = await request.json() as { title?: string; category?: string; phrase?: string; tags?: string[]; status?: string; accent?: string };
  const title = cleanText(body.title, 100);
  const category = cleanText(body.category, 60);
  const phrase = cleanText(body.phrase, 100);
  const status = cleanText(body.status, 20);
  const accent = cleanText(body.accent, 20);
  const tags = Array.isArray(body.tags) ? body.tags.map(tag => cleanText(tag, 24).replace(/^#/, "")).filter(Boolean).slice(0, 3) : [];
  if (!Number.isInteger(modelId) || modelId < 1 || !title || !category || !phrase || !statuses.has(status) || !accents.has(accent)) return Response.json({ error: "Revise os dados do modelo." }, { status: 400 });
  await ensureDatabase();
  const db = await getDb();
  const [updated] = await db.update(models).set({ title, category, phrase, status, accent, tags: JSON.stringify(tags), updatedAt: new Date().toISOString() }).where(eq(models.id, modelId)).returning();
  if (!updated) return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  return Response.json({ model: { ...updated, tags: parseTags(updated.tags) } });
}
