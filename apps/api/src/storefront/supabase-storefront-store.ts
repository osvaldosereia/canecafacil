import type { MugCatalogItem } from '@caneca-facil/core';
import type { StorefrontStore } from './storefront-store.js';

type SupabaseLike = {
  from(table: string): any;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  capacity_ml: number | null;
  tags: string[] | null;
  active: boolean;
  base_price_cents: number | null;
  image_url: string | null;
};

function toCatalogItem(row: TemplateRow): MugCatalogItem | null {
  if (row.base_price_cents === null) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    capacityMl: row.capacity_ml ?? undefined,
    tags: row.tags ?? [],
    active: row.active,
    basePriceCents: row.base_price_cents,
    imageUrl: row.image_url ?? undefined,
  };
}

export function createSupabaseStorefrontStore(supabase: SupabaseLike): StorefrontStore {
  return {
    async listCatalog(filters = {}) {
      let query = supabase.from('mug_templates').select('id,name,description,capacity_ml,tags,active,base_price_cents,image_url');
      if (filters.activeOnly !== false) query = query.eq('active', true);
      const { data, error } = await query.order('name');
      if (error) throw new Error(`storefront_catalog_read_failed: ${error.message}`);
      return ((data ?? []) as TemplateRow[]).map(toCatalogItem).filter((item): item is MugCatalogItem => item !== null);
    },

    async bindTemplateToActiveProject(conversationId, templateId) {
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('active_project_id')
        .eq('id', conversationId)
        .single();
      if (conversationError) throw new Error(`storefront_conversation_read_failed: ${conversationError.message}`);
      if (!conversation?.active_project_id) throw new Error('storefront_active_project_required');

      const { data: template, error: templateError } = await supabase
        .from('mug_templates')
        .select('id,active,base_price_cents')
        .eq('id', templateId)
        .single();
      if (templateError) throw new Error(`storefront_template_read_failed: ${templateError.message}`);
      if (!template?.active || template.base_price_cents === null) throw new Error('storefront_template_not_sellable');

      const { error } = await supabase
        .from('mug_projects')
        .update({ template_id: templateId, updated_at: new Date().toISOString() })
        .eq('id', conversation.active_project_id)
        .eq('conversation_id', conversationId);
      if (error) throw new Error(`storefront_project_bind_failed: ${error.message}`);
    },
  };
}
