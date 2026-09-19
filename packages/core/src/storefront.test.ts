import { describe, expect, it } from 'vitest';
import { compareCatalog, recommendCatalog, searchCatalog, type MugCatalogItem } from './storefront.js';

const items: MugCatalogItem[] = [
  { id: 'classic', name: 'Caneca Clássica', description: 'Cerâmica branca', capacityMl: 325, tags: ['branca', 'presente'], active: true, basePriceCents: 3990 },
  { id: 'magic', name: 'Caneca Mágica', description: 'Revela a arte com calor', capacityMl: 325, tags: ['preta', 'presente'], active: true, basePriceCents: 5990 },
  { id: 'off', name: 'Antiga', tags: ['branca'], active: false, basePriceCents: 1000 },
];

describe('intelligent storefront domain', () => {
  it('searches only active catalog items with deterministic filters', () => {
    expect(searchCatalog(items, { text: 'ceramica', maxPriceCents: 5000 }).map((item) => item.id)).toEqual(['classic']);
  });

  it('ranks contextual recommendations deterministically', () => {
    expect(recommendCatalog(items, { tags: ['preta'], text: 'presente' }, 2).map((item) => item.id)).toEqual(['magic', 'classic']);
  });

  it('compares only requested active items in request order', () => {
    expect(compareCatalog(items, ['magic', 'off', 'classic']).map((item) => item.id)).toEqual(['magic', 'classic']);
  });
});
