import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseChatSessionStore } from './supabase-session-store.js';

function asSupabaseClient(value: unknown): SupabaseClient {
  return value as SupabaseClient;
}

describe('Supabase chat session store', () => {
  it('creates visitor, session and conversation through the atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          session_id: 'session-1',
          visitor_id: 'visitor-1',
          conversation_id: 'conversation-1',
        },
      ],
      error: null,
    });
    const client = asSupabaseClient({ rpc, from: vi.fn() });
    const store = createSupabaseChatSessionStore(client);
    const expiresAt = new Date('2026-10-16T12:00:00.000Z');

    await expect(store.create('a'.repeat(64), expiresAt)).resolves.toEqual({
      sessionId: 'session-1',
      visitorId: 'visitor-1',
      conversationId: 'conversation-1',
      expiresAt: expiresAt.toISOString(),
    });
    expect(rpc).toHaveBeenCalledWith('create_chat_session', {
      p_token_hash: 'a'.repeat(64),
      p_expires_at: expiresAt.toISOString(),
    });
  });

  it('resolves only a live non-revoked session and its open conversation', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'session-2',
        visitor_id: 'visitor-2',
        expires_at: '2026-10-16T12:00:00.000Z',
        revoked_at: null,
      },
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ maybeSingle });
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionEq });

    const conversationMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'conversation-2' },
      error: null,
    });
    const statusEq = vi.fn().mockReturnValue({ maybeSingle: conversationMaybeSingle });
    const visitorEq = vi.fn().mockReturnValue({ eq: statusEq });
    const conversationSelect = vi.fn().mockReturnValue({ eq: visitorEq });

    const client = asSupabaseClient({
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table === 'chat_sessions') return { select: sessionSelect };
        if (table === 'conversations') return { select: conversationSelect };
        throw new Error(`unexpected table ${table}`);
      }),
    });
    const store = createSupabaseChatSessionStore(client);

    await expect(
      store.resolve('b'.repeat(64), new Date('2026-09-16T12:00:00.000Z')),
    ).resolves.toEqual({
      sessionId: 'session-2',
      visitorId: 'visitor-2',
      conversationId: 'conversation-2',
      expiresAt: '2026-10-16T12:00:00.000Z',
    });

    expect(sessionEq).toHaveBeenCalledWith('token_hash', 'b'.repeat(64));
    expect(visitorEq).toHaveBeenCalledWith('visitor_id', 'visitor-2');
    expect(statusEq).toHaveBeenCalledWith('status', 'open');
  });

  it('rejects expired or revoked session rows without loading a conversation', async () => {
    const conversationFrom = vi.fn();

    for (const row of [
      {
        id: 'expired',
        visitor_id: 'visitor-expired',
        expires_at: '2026-09-15T12:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'revoked',
        visitor_id: 'visitor-revoked',
        expires_at: '2026-10-16T12:00:00.000Z',
        revoked_at: '2026-09-16T10:00:00.000Z',
      },
    ]) {
      const client = asSupabaseClient({
        rpc: vi.fn(),
        from: vi.fn((table: string) => {
          if (table === 'conversations') {
            conversationFrom();
            throw new Error('conversation should not be queried');
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
              }),
            }),
          };
        }),
      });

      const store = createSupabaseChatSessionStore(client);
      await expect(
        store.resolve('c'.repeat(64), new Date('2026-09-16T12:00:00.000Z')),
      ).resolves.toBeNull();
    }

    expect(conversationFrom).not.toHaveBeenCalled();
  });
});
