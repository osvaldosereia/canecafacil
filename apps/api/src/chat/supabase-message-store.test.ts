import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseChatMessageStore } from './supabase-message-store.js';

function asSupabaseClient(value: unknown): SupabaseClient {
  return value as SupabaseClient;
}

const customerRow = {
  id: 'customer-message-1',
  conversation_id: 'conversation-1',
  sender_type: 'customer',
  message_kind: 'text',
  text_content: 'Quero uma caneca',
  structured_content: {},
  client_message_id: '7c4c0c87-b137-4df4-90d7-f31c88940864',
  reply_to_message_id: null,
  processing_state: 'completed',
  created_at: '2026-09-16T12:00:00.000Z',
  updated_at: '2026-09-16T12:00:00.000Z',
};

const assistantRow = {
  id: 'assistant-message-1',
  conversation_id: 'conversation-1',
  sender_type: 'ai',
  message_kind: 'text',
  text_content: null,
  structured_content: {},
  client_message_id: null,
  reply_to_message_id: 'customer-message-1',
  processing_state: 'processing',
  created_at: '2026-09-16T12:00:01.000Z',
  updated_at: '2026-09-16T12:00:01.000Z',
};

function singleResult(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data, error }),
    }),
  };
}

describe('Supabase own-chat message store', () => {
  it('accepts the first customer message', async () => {
    const insert = vi.fn().mockReturnValue(singleResult(customerRow));
    const client = asSupabaseClient({
      from: vi.fn().mockReturnValue({ insert }),
    });
    const store = createSupabaseChatMessageStore(client);

    await expect(
      store.createCustomerText({
        conversationId: 'conversation-1',
        clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
        text: 'Quero uma caneca',
      }),
    ).resolves.toMatchObject({ accepted: true, message: { id: 'customer-message-1' } });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conversation-1',
        sender_type: 'customer',
        message_kind: 'text',
        client_message_id: '7c4c0c87-b137-4df4-90d7-f31c88940864',
      }),
    );
  });

  it('returns the original customer message when a retry hits the unique key', async () => {
    const duplicateError = { code: '23505', message: 'duplicate key' };
    const insert = vi.fn().mockReturnValue(singleResult(null, duplicateError));
    const maybeSingle = vi.fn().mockResolvedValue({ data: customerRow, error: null });
    const secondEq = vi.fn().mockReturnValue({ maybeSingle });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const select = vi.fn().mockReturnValue({ eq: firstEq });
    const client = asSupabaseClient({
      from: vi.fn().mockReturnValue({ insert, select }),
    });
    const store = createSupabaseChatMessageStore(client);

    await expect(
      store.createCustomerText({
        conversationId: 'conversation-1',
        clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
        text: 'Quero uma caneca',
      }),
    ).resolves.toMatchObject({ accepted: false, message: { id: 'customer-message-1' } });

    expect(firstEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
    expect(secondEq).toHaveBeenCalledWith(
      'client_message_id',
      '7c4c0c87-b137-4df4-90d7-f31c88940864',
    );
  });

  it('reuses the one assistant draft linked to a customer message', async () => {
    const duplicateError = { code: '23505', message: 'duplicate key' };
    const insert = vi.fn().mockReturnValue(singleResult(null, duplicateError));
    const maybeSingle = vi.fn().mockResolvedValue({ data: assistantRow, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const client = asSupabaseClient({
      from: vi.fn().mockReturnValue({ insert, select }),
    });
    const store = createSupabaseChatMessageStore(client);

    await expect(
      store.ensureAssistantDraft({
        conversationId: 'conversation-1',
        replyToMessageId: 'customer-message-1',
      }),
    ).resolves.toMatchObject({ reused: true, message: { id: 'assistant-message-1' } });

    expect(eq).toHaveBeenCalledWith('reply_to_message_id', 'customer-message-1');
  });
});
