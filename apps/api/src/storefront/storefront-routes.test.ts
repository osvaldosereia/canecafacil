import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSessionStore } from '../chat/session-store.js';
import { registerStorefrontRoutes } from './storefront-routes.js';
import type { StorefrontService } from './storefront-service.js';

const identity = { sessionId: 's1', visitorId: 'v1', conversationId: 'conversation-1', expiresAt: '2026-10-19T00:00:00.000Z' };

function sessionStore(resolved: typeof identity | null = identity): ChatSessionStore {
  return { create: vi.fn(), resolve: vi.fn().mockResolvedValue(resolved), touch: vi.fn().mockResolvedValue(undefined) };
}
function service(): StorefrontService {
  return {
    search: vi.fn().mockResolvedValue([]), recommend: vi.fn().mockResolvedValue([]), compare: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockResolvedValue({ templateId: 'template-1' }),
  };
}
function app(sessions = sessionStore(), storefront = service()) {
  const app = new Hono();
  registerStorefrontRoutes(app, { sessionStore: sessions, service: storefront, chatOrigin: 'http://localhost:5174', sessionCookieName: 'cf_session', now: () => new Date('2026-09-19T10:00:00.000Z') });
  return { app, storefront };
}
const cookie = { Cookie: 'cf_session=raw-token' };

describe('storefront routes', () => {
  it('requires a live session for catalog reads', async () => {
    const { app } = app(sessionStore(null));
    expect((await app.request('/v1/chat/storefront/search')).status).toBe(401);
  });

  it('normalizes bounded search filters', async () => {
    const { app, storefront } = app();
    const response = await app.request('/v1/chat/storefront/search?q=presente&tag=amor&tag=&minPriceCents=1000&maxPriceCents=5000&capacityMl=325', { headers: cookie });
    expect(response.status).toBe(200);
    expect(storefront.search).toHaveBeenCalledWith({ text: 'presente', tags: ['amor'], minPriceCents: 1000, maxPriceCents: 5000, capacityMl: 325 });
  });

  it('never accepts caller-owned conversation identity on selection', async () => {
    const { app, storefront } = app();
    const response = await app.request('/v1/chat/storefront/select', { method: 'POST', headers: { ...cookie, Origin: 'http://localhost:5174', 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'template-1', conversationId: 'attacker', projectId: 'attacker' }) });
    expect(response.status).toBe(200);
    expect(storefront.select).toHaveBeenCalledWith('conversation-1', 'template-1');
  });

  it('rejects cross-origin and invalid selections before mutation', async () => {
    const first = app();
    expect((await first.app.request('/v1/chat/storefront/select', { method: 'POST', headers: { ...cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'template-1' }) })).status).toBe(403);
    expect(first.storefront.select).not.toHaveBeenCalled();
    const second = app();
    expect((await second.app.request('/v1/chat/storefront/select', { method: 'POST', headers: { ...cookie, Origin: 'http://localhost:5174', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(400);
    expect(second.storefront.select).not.toHaveBeenCalled();
  });

  it('maps protected-domain selection failures without leaking internals', async () => {
    const storefront = service();
    vi.mocked(storefront.select).mockRejectedValueOnce(new Error('storefront_active_project_required')).mockRejectedValueOnce(new Error('storefront_template_not_sellable'));
    const { app } = app(sessionStore(), storefront);
    const request = () => app.request('/v1/chat/storefront/select', { method: 'POST', headers: { ...cookie, Origin: 'http://localhost:5174', 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'template-1' }) });
    expect((await request()).status).toBe(409);
    expect((await request()).status).toBe(422);
  });
});
