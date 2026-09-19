import { createEmptyBriefing } from '@caneca-facil/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationOrchestrator } from '../ai/conversation-orchestrator.js';
import type { ChatMessage, ChatMessageStore } from './message-store.js';
import type { ChatSessionStore } from './session-store.js';
import { registerChatTurnRoutes } from './turn-routes.js';

const identity = {
  sessionId: 'session-1',
  visitorId: 'visitor-1',
  conversationId: 'conversation-1',
  expiresAt: '2026-10-16T12:00:00.000Z',
};

const customer: ChatMessage = {
  id: 'customer-1',
  conversationId: 'conversation-1',
  senderType: 'customer',
  messageKind: 'text',
  textContent: 'Quero flores em aquarela',
  structuredContent: {},
  clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
  replyToMessageId: null,
  processingState: 'completed',
  createdAt: '2026-09-18T12:00:00.000Z',
  updatedAt: '2026-09-18T12:00:00.000Z',
};

const draft: ChatMessage = {
  ...customer,
  id: 'assistant-1',
  senderType: 'ai',
  textContent: null,
  clientMessageId: null,
  replyToMessageId: 'customer-1',
  processingState: 'processing',
};

function sessionStore(): ChatSessionStore {
  return {
    create: vi.fn(),
    resolve: vi.fn().mockResolvedValue(identity),
    touch: vi.fn().mockResolvedValue(undefined),
  };
}

function messageStore(): ChatMessageStore {
  return {
    createCustomerText: vi.fn().mockResolvedValue({ accepted: true, message: customer }),
    ensureAssistantDraft: vi.fn().mockResolvedValue({ reused: false, message: draft }),
    completeAssistant: vi.fn().mockImplementation(async (id, text, structuredContent = {}) => ({
      ...draft,
      id,
      textContent: text,
      structuredContent,
      processingState: 'completed',
    })),
    failAssistant: vi.fn().mockResolvedValue(undefined),
    listConversation: vi.fn().mockResolvedValue([customer]),
  };
}

function request(app: Hono) {
  return app.request('/v1/chat/turns', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5174',
      Cookie: 'cf_session=raw-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
      text: 'Quero flores em aquarela',
    }),
  });
}

describe('own-chat orchestration integration', () => {
  it('streams validated components and persists structured assistant content', async () => {
    const messages = messageStore();
    const briefing = {
      ...createEmptyBriefing(),
      mainTheme: 'flores',
      creativeDirection: 'aquarela',
      missingInformation: [],
      confidenceScore: 1,
      readyToGenerate: true,
    };
    const orchestrator: ConversationOrchestrator = {
      handle: vi.fn().mockResolvedValue({
        mode: 'ai',
        replyText: 'Perfeito. O briefing está pronto.',
        components: {
          version: 1,
          components: [
            { type: 'quick_replies', options: [{ id: 'gerar', label: 'Gerar arte' }] },
          ],
        },
        briefing,
        briefingChanged: true,
        briefingId: 'briefing-1',
      }),
    };

    const app = new Hono();
    registerChatTurnRoutes(app, {
      sessionStore: sessionStore(),
      messageStore: messages,
      orchestrator,
      chatOrigin: 'http://localhost:5174',
      sessionCookieName: 'cf_session',
    });

    const response = await request(app);
    const body = await response.text();

    expect(body).toContain('event: component');
    expect(body).toContain('Gerar arte');
    expect(messages.completeAssistant).toHaveBeenCalledWith(
      'assistant-1',
      'Perfeito. O briefing está pronto.',
      expect.objectContaining({
        chatComponentEnvelope: expect.objectContaining({ version: 1 }),
        briefing: {
          id: 'briefing-1',
          readyToGenerate: true,
          missingInformation: [],
        },
      }),
    );
  });

  it.each(['human', 'paused'] as const)(
    'does not create an AI message while automation mode is %s',
    async (mode) => {
      const messages = messageStore();
      const orchestrator: ConversationOrchestrator = {
        handle: vi.fn().mockResolvedValue({
          mode,
          replyText: null,
          briefing: createEmptyBriefing(),
          briefingChanged: false,
          briefingId: null,
        }),
      };

      const app = new Hono();
      registerChatTurnRoutes(app, {
        sessionStore: sessionStore(),
        messageStore: messages,
        orchestrator,
        chatOrigin: 'http://localhost:5174',
        sessionCookieName: 'cf_session',
      });

      const response = await request(app);
      const body = await response.text();

      expect(body).toContain('event: control');
      expect(body).toContain(`"mode":"${mode}"`);
      expect(messages.ensureAssistantDraft).not.toHaveBeenCalled();
      expect(messages.completeAssistant).not.toHaveBeenCalled();
    },
  );
});
