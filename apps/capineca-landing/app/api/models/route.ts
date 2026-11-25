import { desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { models } from "../../../db/schema";
import { toPublicModel } from "../../../lib/models";

export async function GET() {
  await ensureDatabase();
  const db = await getDb();
  const rows = await db.select().from(models).where(eq(models.status, "published")).orderBy(desc(models.createdAt)).limit(200);
  return Response.json({ models: rows.map(row => toPublicModel(row as unknown as Record<string, unknown>)) }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
