import type { PublicModel } from "./models";

export const siteName = "CapiNeca";
export const siteDescription = "Canecas personalizadas para marcas, profissionais e eventos. Crie seis propostas e solicite seu orçamento.";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    return new URL(configured || "https://canecas.juniorsereia.chatgpt.site").origin;
  } catch {
    return "https://canecas.juniorsereia.chatgpt.site";
  }
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function modelPath(model: Pick<PublicModel, "id" | "title">) {
  return `/modelos/${model.id}-${slugify(model.title) || "caneca-personalizada"}`;
}

export function categoryPath(category: string) {
  return `/categorias/${slugify(category) || "presentes"}`;
}

export function absoluteUrl(path: string) {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function modelDescription(model: Pick<PublicModel, "title" | "category" | "phrase">) {
  return `${model.title}: modelo de caneca personalizada da categoria ${model.category}. Personalize o nome ou a frase “${model.phrase}” e confira a prévia antes de comprar.`;
}

export function modelImageAlt(model: Pick<PublicModel, "title" | "category">) {
  return `Arte ${model.title} para caneca branca personalizada, tema ${model.category}`;
}

export function unitPrice() {
  const cents = Number(process.env.MUG_UNIT_PRICE_CENTS || 1990);
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : 19.9;
}
