import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { siteContent } from "../db/schema";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent, type CapinecaSiteContent } from "./capineca-content";

export async function getSiteContent(): Promise<CapinecaSiteContent> {
  try {
    await ensureDatabase();
    const db = await getDb();
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, "published")).limit(1);
    if (!row) return DEFAULT_SITE_CONTENT;
    return normalizeSiteContent(JSON.parse(row.value));
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}
