import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from './session-token.js';
import { registerChatSessionRoutes } from './session-routes.js';
import type { ChatSessionStore } from './session-store.js';

const identity = {
  sessionId: 'session-1',
  visitorId: 'visitor-1',
  conversationId: 'conversation-1',
  expiresAt: '2026-10-16T12:00:00.000Z',
};

function createStore(overrides: Partial<ChatSessionStore> = {}): ChatSessionStore {
  return {
    create: vi.fn().mockResolvedValue(identity),
    resolve: vi.fn().mockResolvedValue(null),
    touch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createApp(store: ChatSessionStore, nodeEnv: 'development' | 'production' = 'development') {
  const app = new Hono();
  registerChatSessionRoutes(app, {
    store,
    chatOrigin: 'http://localhost:5174',
    nodeEnv,
    sessionCookieName: 'cf_session',
    sessionTtlDays: 30,
    now: () => new Date('2026-09-16T12:00:00.000Z'),
    createToken: () => 'test-raw-session-token',
  });
  return app;
}

describe('chat session routes', () => {
  it('creates an HttpOnly session without returning the raw token', async () => {
    const store = createStore();
    const response = await createApp(store).request('/v1/chat/session', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5174' },
    });

    expect(response.status).toBe(201);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('cf_session=test-raw-session-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Secure');

    const body = await response.json();
    expect(body).toEqual(identity);
    expect(JSON.stringify(body)).not.toContain('test-raw-session-token');
    expect(store.create).toHaveBeenCalledWith(
      hashSessionToken('test-raw-session-token'),
      new Date('2026-10-16T12:00:00.000Z'),
    );
  });

  it('rejects session creation from another origin', async () => {
    const store = createStore();
    const response = await createApp(store).request('/v1/chat/session', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });

    expect(response.status).toBe(403);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('resumes a live session from the HttpOnly cookie', async () => {
    const store = createStore({
      resolve: vi.fn().mockResolvedValue(identity),
    });
    const response = await createApp(store).request('/v1/chat/session', {
      method: 'GET',
      headers: { Cookie: 'cf_session=existing-raw-token' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(identity);
    expect(store.resolve).toHaveBeenCalledWith(
      hashSessionToken('existing-raw-token'),
      new Date('2026-09-16T12:00:00.000Z'),
    );
    expect(store.touch).toHaveBeenCalledWith(
      identity,
      new Date('2026-09-16T12:00:00.000Z'),
    );
  });

  it('returns 401 when no live cookie session exists', async () => {
    const store = createStore();
    const response = await createApp(store).request('/v1/chat/session', {
      method: 'GET',
    });

    expect(response.status).toBe(401);
  });

  it('marks the session cookie Secure in production', async () => {
    const response = await createApp(createStore(), 'production').request(
      '/v1/chat/session',
      {
        method: 'POST',
        headers: { Origin: 'http://localhost:5174' },
      },
    );

    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});
