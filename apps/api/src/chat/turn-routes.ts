import { validateChatComponentEnvelope } from '@caneca-facil/core';
import type { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import type { ConversationOrchestrator } from '../ai/conversation-orchestrator.js';
import type { ChatMessageStore } from './message-store.js';
import { createFoundationResponse } from './responder.js';
import type { ChatSessionStore } from './session-store.js';
import { hashSessionToken } from './session-token.js';

export interface ChatTurnRouteConfig {
  sessionStore: ChatSessionStore;
  messageStore: ChatMessageStore;
  chatOrigin: string;
  sessionCookieName: string;
  now?: () => Date;
  respond?: () => AsyncIterable<string>;
  orchestrator?: ConversationOrchestrator;
}

function readTurnBody(value: unknown): { clientMessageId: string; text: string } | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.clientMessageId !== 'string' || typeof body.text !== 'string') return null;
  const text = body.text.trim();
  if (!text || text.length > 8000) return null;
  return { clientMessageId: body.clientMessageId, text };
}

async function* streamText(text: string): AsyncIterable<string> {
  if (text.length < 2) {
    yield text;
    return;
  }
  const midpoint = Math.ceil(text.length / 2);
  yield text.slice(0, midpoint);
  yield text.slice(midpoint);
}

export function registerChatTurnRoutes(app: Hono, config: ChatTurnRouteConfig): void {
  const now = config.now ?? (() => new Date());
  const respond = config.respond ?? createFoundationResponse;

  app.post('/v1/chat/turns', async (context) => {
    if (context.req.header('Origin') !== config.chatOrigin) {
      return context.json({ error: 'origin_not_allowed' }, 403);
    }

    const rawToken = getCookie(context, config.sessionCookieName);
    if (!rawToken) return context.json({ error: 'session_not_found' }, 401);

    const identity = await config.sessionStore.resolve(hashSessionToken(rawToken), now());
    if (!identity) return context.json({ error: 'session_not_found' }, 401);

    let parsed: unknown;
    try {
      parsed = await context.req.json();
    } catch {
      return context.json({ error: 'invalid_chat_turn' }, 400);
    }

    const turn = readTurnBody(parsed);
    if (!turn) return context.json({ error: 'invalid_chat_turn' }, 400);

    await config.sessionStore.touch(identity, now());
    const customerResult = await config.messageStore.createCustomerText({
      conversationId: identity.conversationId,
      clientMessageId: turn.clientMessageId,
      text: turn.text,
    });

    return streamSSE(context, async (stream) => {
      await stream.writeSSE({
        event: 'accepted',
        data: JSON.stringify({
          messageId: customerResult.message.id,
          accepted: customerResult.accepted,
        }),
      });

      let orchestration: Awaited<ReturnType<ConversationOrchestrator['handle']>> | undefined;

      if (config.orchestrator) {
        const history = await config.messageStore.listConversation(identity.conversationId);
        const existingReply = history.find(
          (message) =>
            message.senderType === 'ai' &&
            message.replyToMessageId === customerResult.message.id,
        );

        if (
          existingReply?.processingState === 'completed' &&
          existingReply.textContent
        ) {
          await stream.writeSSE({
            event: 'text_delta',
            data: JSON.stringify({ text: existingReply.textContent }),
          });
          const savedEnvelope = existingReply.structuredContent.chatComponentEnvelope;
          if (savedEnvelope) {
            const envelope = validateChatComponentEnvelope(savedEnvelope);
            await stream.writeSSE({
              event: 'component',
              data: JSON.stringify(envelope),
            });
          }
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ assistantMessageId: existingReply.id }),
          });
          return;
        }

        orchestration = await config.orchestrator.handle({
          conversationId: identity.conversationId,
          customerText: turn.text,
          recentMessages: history
            .filter((message) => message.textContent)
            .slice(-8)
            .map((message) => ({
              senderType: message.senderType,
              text: message.textContent!,
            })),
        });

        if (orchestration.mode !== 'ai' || !orchestration.replyText) {
          await stream.writeSSE({
            event: 'control',
            data: JSON.stringify({ mode: orchestration.mode }),
          });
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ assistantMessageId: null }),
          });
          return;
        }
      }

      const assistantResult = await config.messageStore.ensureAssistantDraft({
        conversationId: identity.conversationId,
        replyToMessageId: customerResult.message.id,
      });

      if (
        assistantResult.reused &&
        assistantResult.message.processingState === 'completed' &&
        assistantResult.message.textContent
      ) {
        await stream.writeSSE({
          event: 'text_delta',
          data: JSON.stringify({ text: assistantResult.message.textContent }),
        });
        const savedEnvelope = assistantResult.message.structuredContent.chatComponentEnvelope;
        if (savedEnvelope) {
          const envelope = validateChatComponentEnvelope(savedEnvelope);
          await stream.writeSSE({
            event: 'component',
            data: JSON.stringify(envelope),
          });
        }
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ assistantMessageId: assistantResult.message.id }),
        });
        return;
      }

      let fullText = '';
      try {
        const chunks = orchestration?.replyText
          ? streamText(orchestration.replyText)
          : respond();

        for await (const chunk of chunks) {
          fullText += chunk;
          await stream.writeSSE({
            event: 'text_delta',
            data: JSON.stringify({ text: chunk }),
          });
        }

        const componentEnvelope = orchestration?.components
          ? validateChatComponentEnvelope(orchestration.components)
          : undefined;

        if (componentEnvelope) {
          await stream.writeSSE({
            event: 'component',
            data: JSON.stringify(componentEnvelope),
          });
        }

        const structuredContent: Record<string, unknown> | undefined = orchestration
          ? {
              ...(componentEnvelope
                ? { chatComponentEnvelope: componentEnvelope }
                : {}),
              briefing: {
                id: orchestration.briefingId,
                readyToGenerate: orchestration.briefing.readyToGenerate,
                missingInformation: orchestration.briefing.missingInformation,
              },
            }
          : undefined;

        const completed = structuredContent
          ? await config.messageStore.completeAssistant(
              assistantResult.message.id,
              fullText,
              structuredContent,
            )
          : await config.messageStore.completeAssistant(
              assistantResult.message.id,
              fullText,
            );

        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ assistantMessageId: completed.id }),
        });
      } catch {
        await config.messageStore.failAssistant(assistantResult.message.id);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ code: 'response_failed' }),
        });
      }
    });
  });

  app.get('/v1/chat/conversation', async (context) => {
    const rawToken = getCookie(context, config.sessionCookieName);
    if (!rawToken) return context.json({ error: 'session_not_found' }, 401);

    const identity = await config.sessionStore.resolve(hashSessionToken(rawToken), now());
    if (!identity) return context.json({ error: 'session_not_found' }, 401);

    await config.sessionStore.touch(identity, now());
    const messages = await config.messageStore.listConversation(identity.conversationId);
    return context.json({ conversationId: identity.conversationId, messages }, 200);
  });
}
