import type { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createOpaqueSessionToken, hashSessionToken } from './session-token.js';
import type { ChatSessionStore } from './session-store.js';

export interface ChatSessionRouteConfig {
  store: ChatSessionStore;
  chatOrigin: string;
  nodeEnv: 'development' | 'test' | 'production';
  sessionCookieName: string;
  sessionTtlDays: number;
  now?: () => Date;
  createToken?: () => string;
}

export function registerChatSessionRoutes(
  app: Hono,
  config: ChatSessionRouteConfig,
): void {
  const now = config.now ?? (() => new Date());
  const createToken = config.createToken ?? createOpaqueSessionToken;

  app.post('/v1/chat/session', async (context) => {
    if (context.req.header('Origin') !== config.chatOrigin) {
      return context.json({ error: 'origin_not_allowed' }, 403);
    }

    const currentTime = now();
    const existingToken = getCookie(context, config.sessionCookieName);
    if (existingToken) {
      const existing = await config.store.resolve(
        hashSessionToken(existingToken),
        currentTime,
      );
      if (existing) {
        await config.store.touch(existing, currentTime);
        return context.json(existing, 200);
      }
    }

    const rawToken = createToken();
    const expiresAt = new Date(
      currentTime.getTime() + config.sessionTtlDays * 86_400_000,
    );
    const identity = await config.store.create(
      hashSessionToken(rawToken),
      expiresAt,
    );

    setCookie(context, config.sessionCookieName, rawToken, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: config.sessionTtlDays * 86_400,
      secure: config.nodeEnv === 'production',
    });

    return context.json(identity, 201);
  });

  app.get('/v1/chat/session', async (context) => {
    const rawToken = getCookie(context, config.sessionCookieName);
    if (!rawToken) return context.json({ error: 'session_not_found' }, 401);

    const currentTime = now();
    const identity = await config.store.resolve(
      hashSessionToken(rawToken),
      currentTime,
    );
    if (!identity) return context.json({ error: 'session_not_found' }, 401);

    await config.store.touch(identity, currentTime);
    return context.json(identity, 200);
  });
}
