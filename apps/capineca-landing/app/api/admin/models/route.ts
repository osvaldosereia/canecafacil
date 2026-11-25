import { desc } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { models } from "../../../../db/schema";
import { getAdminAccess } from "../../../../lib/admin-auth";
import { parseTags } from "../../../../lib/models";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  const db = await getDb();
  const rows = await db.select().from(models).orderBy(desc(models.createdAt)).limit(300);
  return Response.json({ models: rows.map(row => ({ ...row, tags: parseTags(row.tags) })) }, { headers: { "cache-control": "no-store" } });
}
