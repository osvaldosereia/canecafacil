import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { models } from "../../../../db/schema";
import { archiveRemoteImage } from "../../../../lib/assets";
import { cleanText } from "../../../../lib/commerce";

type Body = { sourceJobId?: string; title?: string; category?: string; tags?: string[]; imageUrl?: string; phrase?: string; accent?: string };
const accents = new Set(["coral", "sage", "blue", "lavender", "rose", "coffee"]);

function isAuthorized(request: Request) {
  const secret = process.env.MODEL_FEED_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-webhook-secret") || "";
  return authorization === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
  if (!process.env.MODEL_FEED_WEBHOOK_SECRET?.trim()) return Response.json({ error: "A entrada de modelos ainda não foi configurada." }, { status: 503 });
  if (!isAuthorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json() as Body;
  const sourceJobId = cleanText(body.sourceJobId, 120);
  const title = cleanText(body.title, 100);
  const category = cleanText(body.category, 60);
  const phrase = cleanText(body.phrase, 100);
  const imageUrl = cleanText(body.imageUrl, 1000);
  const accentInput = cleanText(body.accent, 20);
  const accent = accents.has(accentInput) ? accentInput : "blue";
  const tags = Array.isArray(body.tags) ? body.tags.map(tag => cleanText(tag, 24).replace(/^#/, "")).filter(Boolean).slice(0, 3) : [];
  if (!title || !category || !phrase || !imageUrl) return Response.json({ error: "Informe título, categoria, frase e imageUrl." }, { status: 400 });
  try { const url = new URL(imageUrl); if (url.protocol !== "https:") throw new Error(); }
  catch { return Response.json({ error: "imageUrl deve ser um endereço HTTPS válido." }, { status: 400 }); }

  await ensureDatabase();
  const db = await getDb();
  if (sourceJobId) {
    const [existing] = await db.select().from(models).where(eq(models.sourceJobId, sourceJobId)).limit(1);
    if (existing) return Response.json({ model: existing, duplicate: true });
  }
  let archivedImageUrl: string;
  try { archivedImageUrl = await archiveRemoteImage(imageUrl, "models", sourceJobId || crypto.randomUUID()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível arquivar a imagem." }, { status: 502 }); }
  const [created] = await db.insert(models).values({ sourceJobId: sourceJobId || null, title, category, phrase, imageUrl: archivedImageUrl, accent, tags: JSON.stringify(tags), status: "review" }).returning();
  return Response.json({ model: created, status: "review" }, { status: 201 });
}
