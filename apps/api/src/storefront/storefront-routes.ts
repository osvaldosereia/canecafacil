import type { StorefrontQuery } from '@caneca-facil/core';
import type { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { ChatSessionStore } from '../chat/session-store.js';
import { hashSessionToken } from '../chat/session-token.js';
import type { StorefrontService } from './storefront-service.js';

export interface StorefrontRouteConfig {
  sessionStore: ChatSessionStore;
  service: StorefrontService;
  chatOrigin: string;
  sessionCookieName: string;
  now?: () => Date;
}

function queryFromUrl(url: URL): StorefrontQuery {
  const integer = (name: string) => {
    const raw = url.searchParams.get(name);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  return {
    text: url.searchParams.get('q')?.trim() || undefined,
    tags: url.searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    minPriceCents: integer('minPriceCents'),
    maxPriceCents: integer('maxPriceCents'),
    capacityMl: integer('capacityMl'),
  };
}

export function registerStorefrontRoutes(app: Hono, config: StorefrontRouteConfig): void {
  const now = config.now ?? (() => new Date());
  const identity = async (context: any) => {
    const rawToken = getCookie(context, config.sessionCookieName);
    if (!rawToken) return null;
    const resolved = await config.sessionStore.resolve(hashSessionToken(rawToken), now());
    if (resolved) await config.sessionStore.touch(resolved, now());
    return resolved;
  };

  app.get('/v1/chat/storefront/search', async (context) => {
    if (!(await identity(context))) return context.json({ error: 'session_not_found' }, 401);
    return context.json({ items: await config.service.search(queryFromUrl(new URL(context.req.url))) });
  });

  app.get('/v1/chat/storefront/recommend', async (context) => {
    if (!(await identity(context))) return context.json({ error: 'session_not_found' }, 401);
    const url = new URL(context.req.url);
    const rawLimit = Number(url.searchParams.get('limit') ?? 6);
    const limit = Number.isSafeInteger(rawLimit) ? rawLimit : 6;
    return context.json({ items: await config.service.recommend(queryFromUrl(url), limit) });
  });

  app.get('/v1/chat/storefront/compare', async (context) => {
    if (!(await identity(context))) return context.json({ error: 'session_not_found' }, 401);
    const ids = new URL(context.req.url).searchParams.getAll('id').filter(Boolean).slice(0, 4);
    return context.json({ items: await config.service.compare(ids) });
  });

  app.post('/v1/chat/storefront/select', async (context) => {
    if (context.req.header('Origin') !== config.chatOrigin) return context.json({ error: 'origin_not_allowed' }, 403);
    const resolved = await identity(context);
    if (!resolved) return context.json({ error: 'session_not_found' }, 401);
    let body: unknown;
    try { body = await context.req.json(); } catch { return context.json({ error: 'invalid_selection' }, 400); }
    const templateId = body && typeof body === 'object' ? (body as any).templateId : undefined;
    if (typeof templateId !== 'string' || !templateId.trim()) return context.json({ error: 'invalid_selection' }, 400);
    try {
      return context.json(await config.service.select(resolved.conversationId, templateId.trim()), 200);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'storefront_selection_failed';
      if (code === 'storefront_active_project_required') return context.json({ error: code }, 409);
      if (code === 'storefront_template_not_sellable') return context.json({ error: code }, 422);
      return context.json({ error: 'storefront_selection_failed' }, 500);
    }
  });
}
