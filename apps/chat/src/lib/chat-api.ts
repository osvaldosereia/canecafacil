import type { ChatSseEvent } from './sse.js';
import { parseSseResponse } from './sse.js';

export interface BrowserChatMessage {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'ai' | 'human' | 'system' | 'automation';
  messageKind: 'text' | 'image' | 'audio' | 'document' | 'system' | 'component' | 'notice';
  textContent: string | null;
  structuredContent: Record<string, unknown>;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  processingState: 'received' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationPayload {
  conversationId: string;
  messages: BrowserChatMessage[];
}

export interface ChatMediaPayload {
  id: string;
  mediaType: 'image' | 'audio';
  [key: string]: unknown;
}

export interface ChatApi {
  startSession(): Promise<{ conversationId: string }>;
  loadConversation(): Promise<ChatConversationPayload>;
  sendTurn(text: string): AsyncGenerator<ChatSseEvent>;
  uploadMedia(file: File): Promise<ChatMediaPayload>;
}

export interface ChatApiOptions {
  apiUrl: string;
  fetchImpl?: typeof fetch;
  createMessageId?: () => string;
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${context} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export function createChatApi(options: ChatApiOptions): ChatApi {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.apiUrl.replace(/\/$/, '');
  const createMessageId = options.createMessageId ?? (() => crypto.randomUUID());

  return {
    async startSession() {
      const response = await fetchImpl(`${baseUrl}/v1/chat/session`, {
        method: 'POST',
        credentials: 'include',
      });
      return readJson<{ conversationId: string }>(response, 'Chat session');
    },

    async loadConversation() {
      const response = await fetchImpl(`${baseUrl}/v1/chat/conversation`, {
        method: 'GET',
        credentials: 'include',
      });
      return readJson<ChatConversationPayload>(response, 'Conversation history');
    },

    async *sendTurn(text) {
      const response = await fetchImpl(`${baseUrl}/v1/chat/turns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientMessageId: createMessageId(),
          text,
        }),
      });

      for await (const event of parseSseResponse(response)) {
        yield event;
      }
    },

    async uploadMedia(file) {
      const form = new FormData();
      form.set('file', file);
      const response = await fetchImpl(`${baseUrl}/v1/chat/media`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      return readJson<ChatMediaPayload>(response, 'Media upload');
    },
  };
}
