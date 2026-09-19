import type { MugCatalogItem } from '@caneca-facil/core';

export type CatalogFilters = {
  activeOnly?: boolean;
};

export interface StorefrontStore {
  listCatalog(filters?: CatalogFilters): Promise<MugCatalogItem[]>;
  bindTemplateToActiveProject(conversationId: string, templateId: string): Promise<void>;
}
