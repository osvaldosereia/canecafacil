import { desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { models } from "../db/schema";
import { PublicModel, starterModels, toPublicModel } from "./models";
import { slugify } from "./seo";

export async function getPublishedModels(limit = 200): Promise<PublicModel[]> {
  try {
    await ensureDatabase();
    const db = await getDb();
    const rows = await db.select().from(models).where(eq(models.status, "published")).orderBy(desc(models.createdAt)).limit(limit);
    return rows.length ? rows.map(row => toPublicModel(row as unknown as Record<string, unknown>)) : starterModels;
  } catch {
    return starterModels;
  }
}

export async function getPublishedModel(id: number) {
  if (!Number.isInteger(id) || id < 1) return null;
  const allModels = await getPublishedModels();
  return allModels.find(model => model.id === id) || null;
}

export async function getPublishedModelsByCategory(categorySlug: string) {
  const allModels = await getPublishedModels();
  const category = allModels.find(model => slugify(model.category) === categorySlug)?.category;
  if (!category) return { category: null, models: [] as PublicModel[] };
  return { category, models: allModels.filter(model => model.category === category) };
}
