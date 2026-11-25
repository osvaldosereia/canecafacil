import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { personalizations } from "../../../../db/schema";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!id || !token) return Response.json({ error: "Consulta inválida." }, { status: 400 });
  await ensureDatabase();
  const db = await getDb();
  const [row] = await db.select().from(personalizations).where(and(eq(personalizations.id, id), eq(personalizations.publicToken, token))).limit(1);
  if (!row) return Response.json({ error: "Personalização não encontrada." }, { status: 404 });
  return Response.json({ id: row.id, token: row.publicToken, status: row.status, mode: row.mode, artImageUrl: row.artImageUrl, mugMockupUrl: row.mugMockupUrl, error: row.error }, { headers: { "cache-control": "no-store" } });
}
