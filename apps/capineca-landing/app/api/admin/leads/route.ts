import { desc } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { b2bLeads } from "../../../../db/schema";
import { getAdminAccess } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  const db = await getDb();
  const leads = await db.select().from(b2bLeads).orderBy(desc(b2bLeads.createdAt)).limit(500);
  return Response.json({ leads }, { headers: { "cache-control": "no-store" } });
}
