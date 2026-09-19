import { compareCatalog, recommendCatalog, searchCatalog, type MugCatalogItem, type StorefrontQuery } from '@caneca-facil/core';
import type { StorefrontStore } from './storefront-store.js';

export interface StorefrontService {
  search(query: StorefrontQuery): Promise<MugCatalogItem[]>;
  recommend(query: StorefrontQuery, limit?: number): Promise<MugCatalogItem[]>;
  compare(ids: string[]): Promise<MugCatalogItem[]>;
  select(conversationId: string, templateId: string): Promise<{ templateId: string }>;
}

export function createStorefrontService(store: StorefrontStore): StorefrontService {
  return {
    async search(query) {
      return searchCatalog(await store.listCatalog({ activeOnly: true }), query);
    },
    async recommend(query, limit = 6) {
      return recommendCatalog(await store.listCatalog({ activeOnly: true }), query, Math.min(Math.max(limit, 1), 12));
    },
    async compare(ids) {
      return compareCatalog(await store.listCatalog({ activeOnly: true }), ids, 4);
    },
    async select(conversationId, templateId) {
      await store.bindTemplateToActiveProject(conversationId, templateId);
      return { templateId };
    },
  };
}
