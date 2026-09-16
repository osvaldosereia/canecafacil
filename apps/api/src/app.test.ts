import { describe, expect, it, vi } from 'vitest';
import type { ChatMessageStore } from './chat/message-store.js';
import type { ChatSessionStore } from './chat/session-store.js';
import type { ChatMediaStore } from './media/media-store.js';
import { createApiApp } from './app';

describe('healthcheck', () => {
  it('retorna ok', async () => {
    const response = await createApiApp().request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'caneca-facil-api',
    });
  });
});

describe('API configuration', () => {
  it('does not register a Meta webhook', async () => {
    const response = await createApiApp({}).request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=legacy&hub.challenge=42',
    );

    expect(response.status).toBe(404);
  });

  it('registers own-chat turn routes when chat stores are available', async () => {
    const sessionStore: ChatSessionStore = {
      create: vi.fn(),
      resolve: vi.fn().mockResolvedValue(null),
      touch: vi.fn(),
    };
    const messageStore: ChatMessageStore = {
      createCustomerText: vi.fn(),
      ensureAssistantDraft: vi.fn(),
      completeAssistant: vi.fn(),
      failAssistant: vi.fn(),
      listConversation: vi.fn(),
    };

    const app = createApiApp(
      {
        chatOrigin: 'http://localhost:5174',
        nodeEnv: 'test',
        sessionCookieName: 'cf_session',
        sessionTtlDays: 30,
      },
      { sessionStore, messageStore },
    );

    const response = await app.request('/v1/chat/turns', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5174',
        Cookie: 'cf_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
        text: 'Quero uma caneca',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('registers own-chat media route when stores are available', async () => {
    const sessionStore: ChatSessionStore = {
      create: vi.fn(),
      resolve: vi.fn().mockResolvedValue(null),
      touch: vi.fn(),
    };
    const mediaStore: ChatMediaStore = {
      save: vi.fn(),
    };
    const app = createApiApp(
      {
        chatOrigin: 'http://localhost:5174',
        nodeEnv: 'test',
        sessionCookieName: 'cf_session',
        sessionTtlDays: 30,
      },
      { sessionStore, mediaStore },
    );

    const form = new FormData();
    form.set('file', new File(['x'], 'photo.png', { type: 'image/png' }));
    const response = await app.request('/v1/chat/media', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5174',
        Cookie: 'cf_session=test-token',
      },
      body: form,
    });

    expect(response.status).toBe(401);
  });
});
