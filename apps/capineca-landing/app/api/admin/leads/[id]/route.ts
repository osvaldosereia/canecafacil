import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../../db";
import { b2bLeads } from "../../../../../db/schema";
import { getAdminAccess } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
const statuses = new Set(["new", "contacted", "quoted", "closed", "archived"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !statuses.has(String(body.status))) return Response.json({ error: "Etapa inválida." }, { status: 400 });
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  await ensureDatabase();
  const db = await getDb();
  const [updated] = await db.update(b2bLeads).set({ status: String(body.status), notes, updatedAt: new Date().toISOString() }).where(eq(b2bLeads.id, id)).returning({ id: b2bLeads.id });
  if (!updated) return Response.json({ error: "Este orçamento não foi encontrado." }, { status: 404 });
  return Response.json({ saved: true });
}
