import { describe, expect, it, vi } from 'vitest';
import { createStorefrontService } from './storefront-service.js';
import type { StorefrontStore } from './storefront-store.js';

const catalog = [
  { id: 'basic', name: 'Caneca Branca', description: 'Clássica', tags: ['classica'], priceCents: 2990, capacityMl: 325, imageUrl: null, active: true },
  { id: 'premium', name: 'Caneca Premium', description: 'Presente elegante', tags: ['presente', 'premium'], priceCents: 4990, capacityMl: 325, imageUrl: null, active: true },
];

function store(): StorefrontStore {
  return {
    listCatalog: vi.fn().mockResolvedValue(catalog),
    bindTemplateToActiveProject: vi.fn().mockResolvedValue(undefined),
  };
}

describe('StorefrontService', () => {
  it('keeps search and recommendation server-authoritative', async () => {
    const repository = store();
    const service = createStorefrontService(repository);
    await expect(service.search({ text: 'Premium', maxPriceCents: 5000 })).resolves.toEqual([catalog[1]]);
    const recommended = await service.recommend({ tags: ['presente'] }, 99);
    expect(recommended[0]?.id).toBe('premium');
    expect(recommended.length).toBeLessThanOrEqual(12);
    expect(repository.listCatalog).toHaveBeenCalledWith({ activeOnly: true });
  });

  it('bounds comparison and delegates protected selection to the store', async () => {
    const repository = store();
    const service = createStorefrontService(repository);
    await expect(service.compare(['premium', 'basic', 'missing'])).resolves.toEqual([catalog[1], catalog[0]]);
    await expect(service.select('conversation-1', 'premium')).resolves.toEqual({ templateId: 'premium' });
    expect(repository.bindTemplateToActiveProject).toHaveBeenCalledWith('conversation-1', 'premium');
  });
});
