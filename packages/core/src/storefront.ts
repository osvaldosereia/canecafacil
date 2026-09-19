export type MugCatalogItem = {
  id: string;
  name: string;
  description?: string;
  capacityMl?: number;
  tags: string[];
  active: boolean;
  basePriceCents: number;
  imageUrl?: string;
};

export type StorefrontQuery = {
  text?: string;
  tags?: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  capacityMl?: number;
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function searchCatalog(items: MugCatalogItem[], query: StorefrontQuery): MugCatalogItem[] {
  const text = normalize(query.text ?? '');
  const wantedTags = (query.tags ?? []).map(normalize);

  return items.filter((item) => {
    if (!item.active) return false;
    if (query.minPriceCents !== undefined && item.basePriceCents < query.minPriceCents) return false;
    if (query.maxPriceCents !== undefined && item.basePriceCents > query.maxPriceCents) return false;
    if (query.capacityMl !== undefined && item.capacityMl !== query.capacityMl) return false;

    const tags = item.tags.map(normalize);
    if (wantedTags.length && !wantedTags.every((tag) => tags.includes(tag))) return false;

    if (text) {
      const haystack = normalize([item.name, item.description ?? '', ...item.tags].join(' '));
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

export function recommendCatalog(items: MugCatalogItem[], query: StorefrontQuery, limit = 6): MugCatalogItem[] {
  const textTokens = normalize(query.text ?? '').split(/\s+/).filter(Boolean);
  const wantedTags = (query.tags ?? []).map(normalize);
  return searchCatalog(items, { ...query, text: undefined, tags: undefined })
    .map((item) => {
      const haystack = normalize([item.name, item.description ?? '', ...item.tags].join(' '));
      const tags = item.tags.map(normalize);
      const score = textTokens.filter((token) => haystack.includes(token)).length +
        wantedTags.filter((tag) => tags.includes(tag)).length * 2;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.basePriceCents - b.item.basePriceCents || a.item.name.localeCompare(b.item.name))
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}

export function compareCatalog(items: MugCatalogItem[], ids: string[], maxItems = 4): MugCatalogItem[] {
  const wanted = new Set(ids.slice(0, maxItems));
  const byId = new Map(items.filter((item) => item.active).map((item) => [item.id, item]));
  return ids.slice(0, maxItems).filter((id) => wanted.has(id)).map((id) => byId.get(id)).filter((item): item is MugCatalogItem => Boolean(item));
}
