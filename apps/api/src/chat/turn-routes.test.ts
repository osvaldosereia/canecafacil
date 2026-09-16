import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { registerChatTurnRoutes } from './turn-routes.js';
import type { ChatMessage, ChatMessageStore } from './message-store.js';
import type { ChatSessionStore } from './session-store.js';

const sessionIdentity = {
  sessionId: 'session-1',
  visitorId: 'visitor-1',
  conversationId: 'conversation-1',
  expiresAt: '2026-10-16T12:00:00.000Z',
};

const customerMessage: ChatMessage = {
  id: 'customer-message-1',
  conversationId: 'conversation-1',
  senderType: 'customer',
  messageKind: 'text',
  textContent: 'Quero uma caneca para minha esposa',
  structuredContent: {},
  clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
  replyToMessageId: null,
  processingState: 'completed',
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
};

const assistantDraft: ChatMessage = {
  id: 'assistant-message-1',
  conversationId: 'conversation-1',
  senderType: 'ai',
  messageKind: 'text',
  textContent: null,
  structuredContent: {},
  clientMessageId: null,
  replyToMessageId: 'customer-message-1',
  processingState: 'processing',
  createdAt: '2026-09-16T12:00:01.000Z',
  updatedAt: '2026-09-16T12:00:01.000Z',
};

function createSessionStore(live = true): ChatSessionStore {
  return {
    create: vi.fn(),
    resolve: vi.fn().mockResolvedValue(live ? sessionIdentity : null),
    touch: vi.fn().mockResolvedValue(undefined),
  };
}

function createMessageStore(overrides: Partial<ChatMessageStore> = {}): ChatMessageStore {
  return {
    createCustomerText: vi.fn().mockResolvedValue({
      accepted: true,
      message: customerMessage,
    }),
    ensureAssistantDraft: vi.fn().mockResolvedValue({
      reused: false,
      message: assistantDraft,
    }),
    completeAssistant: vi.fn().mockImplementation(async (messageId, text) => ({
      ...assistantDraft,
      id: messageId,
      textContent: text,
      processingState: 'completed' as const,
    })),
    failAssistant: vi.fn().mockResolvedValue(undefined),
    listConversation: vi.fn().mockResolvedValue([customerMessage]),
    ...overrides,
  };
}

function createApp(options: {
  sessionStore?: ChatSessionStore;
  messageStore?: ChatMessageStore;
  respond?: () => AsyncIterable<string>;
}) {
  const app = new Hono();
  registerChatTurnRoutes(app, {
    sessionStore: options.sessionStore ?? createSessionStore(),
    messageStore: options.messageStore ?? createMessageStore(),
    chatOrigin: 'http://localhost:5174',
    sessionCookieName: 'cf_session',
    now: () => new Date('2026-09-16T12:00:00.000Z'),
    respond: options.respond,
  });
  return app;
}

const turnBody = JSON.stringify({
  clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
  text: 'Quero uma caneca para minha esposa',
});

const sessionHeaders = {
  Cookie: 'cf_session=raw-session-token',
};

describe('own-chat turn routes', () => {
  it('rejects a turn without a live session', async () => {
    const response = await createApp({ sessionStore: createSessionStore(false) }).request(
      '/v1/chat/turns',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5174',
          'Content-Type': 'application/json',
          ...sessionHeaders,
        },
        body: turnBody,
      },
    );
    expect(response.status).toBe(401);
  });

  it('rejects a turn from another origin before persistence', async () => {
    const messageStore = createMessageStore();
    const response = await createApp({ messageStore }).request('/v1/chat/turns', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        ...sessionHeaders,
      },
      body: turnBody,
    });

    expect(response.status).toBe(403);
    expect(messageStore.createCustomerText).not.toHaveBeenCalled();
  });

  it('persists a turn, streams text deltas and completes the durable AI reply', async () => {
    const messageStore = createMessageStore();
    const response = await createApp({ messageStore }).request('/v1/chat/turns', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5174',
        'Content-Type': 'application/json',
        ...sessionHeaders,
      },
      body: turnBody,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const stream = await response.text();
    expect(stream).toContain('event: accepted');
    expect(stream).toContain('"messageId":"customer-message-1"');
    expect(stream).toContain('"accepted":true');
    expect(stream).toContain('event: text_delta');
    expect(stream).toContain('Entendi. ');
    expect(stream).toContain('event: done');
    expect(stream).toContain('"assistantMessageId":"assistant-message-1"');
    expect(messageStore.completeAssistant).toHaveBeenCalledWith(
      'assistant-message-1',
      'Entendi. Pode continuar me contando como você imagina sua caneca.',
    );
  });

  it('replays the existing completed AI reply on a duplicate browser retry', async () => {
    const completed = {
      ...assistantDraft,
      textContent: 'Resposta já concluída.',
      processingState: 'completed' as const,
    };
    const messageStore = createMessageStore({
      createCustomerText: vi.fn().mockResolvedValue({ accepted: false, message: customerMessage }),
      ensureAssistantDraft: vi.fn().mockResolvedValue({ reused: true, message: completed }),
    });

    const response = await createApp({ messageStore }).request('/v1/chat/turns', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5174',
        'Content-Type': 'application/json',
        ...sessionHeaders,
      },
      body: turnBody,
    });

    const stream = await response.text();
    expect(stream).toContain('"accepted":false');
    expect(stream).toContain('Resposta já concluída.');
    expect(messageStore.completeAssistant).not.toHaveBeenCalled();
  });

  it('marks the assistant message failed when response streaming fails', async () => {
    async function* brokenResponse() {
      yield 'Começou';
      throw new Error('simulated responder failure');
    }
    const messageStore = createMessageStore();
    const response = await createApp({ messageStore, respond: brokenResponse }).request(
      '/v1/chat/turns',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5174',
          'Content-Type': 'application/json',
          ...sessionHeaders,
        },
        body: turnBody,
      },
    );

    const stream = await response.text();
    expect(stream).toContain('event: error');
    expect(stream).toContain('response_failed');
    expect(messageStore.failAssistant).toHaveBeenCalledWith('assistant-message-1');
  });

  it('returns ordered durable conversation history for the live session', async () => {
    const messageStore = createMessageStore({
      listConversation: vi.fn().mockResolvedValue([customerMessage, {
        ...assistantDraft,
        textContent: 'Entendi.',
        processingState: 'completed',
      }]),
    });
    const response = await createApp({ messageStore }).request('/v1/chat/conversation', {
      method: 'GET',
      headers: sessionHeaders,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversationId: 'conversation-1',
      messages: expect.arrayContaining([
        expect.objectContaining({ id: 'customer-message-1' }),
        expect.objectContaining({ id: 'assistant-message-1' }),
      ]),
    });
    expect(messageStore.listConversation).toHaveBeenCalledWith('conversation-1');
  });
});
