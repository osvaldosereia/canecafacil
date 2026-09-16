import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatSessionIdentity, ChatSessionStore } from './session-store.js';

function mapCreatedSession(
  row: Record<string, unknown> | null | undefined,
  expiresAt: Date,
): ChatSessionIdentity {
  if (
    !row ||
    typeof row.session_id !== 'string' ||
    typeof row.visitor_id !== 'string' ||
    typeof row.conversation_id !== 'string'
  ) {
    throw new Error('Chat session creation returned invalid data');
  }

  return {
    sessionId: row.session_id,
    visitorId: row.visitor_id,
    conversationId: row.conversation_id,
    expiresAt: expiresAt.toISOString(),
  };
}

function readSessionRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  if (
    typeof row.id !== 'string' ||
    typeof row.visitor_id !== 'string' ||
    typeof row.expires_at !== 'string' ||
    (row.revoked_at !== null && typeof row.revoked_at !== 'string')
  ) {
    throw new Error('Chat session database row was invalid');
  }

  return {
    id: row.id,
    visitorId: row.visitor_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export function createSupabaseChatSessionStore(
  client: SupabaseClient,
): ChatSessionStore {
  return {
    async create(tokenHash, expiresAt) {
      const { data, error } = await client.rpc('create_chat_session', {
        p_token_hash: tokenHash,
        p_expires_at: expiresAt.toISOString(),
      });

      if (error) throw new Error('Chat session creation failed');
      const row = Array.isArray(data) ? data[0] : data;
      return mapCreatedSession(
        row && typeof row === 'object' ? (row as Record<string, unknown>) : null,
        expiresAt,
      );
    },

    async resolve(tokenHash, now) {
      const { data: sessionData, error: sessionError } = await client
        .from('chat_sessions')
        .select('id, visitor_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (sessionError) throw new Error('Chat session lookup failed');
      const session = readSessionRow(
        sessionData && typeof sessionData === 'object'
          ? (sessionData as Record<string, unknown>)
          : null,
      );
      if (!session) return null;
      if (session.revokedAt !== null) return null;

      const expiresAt = new Date(session.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return null;

      const { data: conversationData, error: conversationError } = await client
        .from('conversations')
        .select('id')
        .eq('visitor_id', session.visitorId)
        .eq('status', 'open')
        .maybeSingle();

      if (conversationError) throw new Error('Chat conversation lookup failed');
      if (
        !conversationData ||
        typeof conversationData !== 'object' ||
        typeof (conversationData as Record<string, unknown>).id !== 'string'
      ) {
        return null;
      }

      return {
        sessionId: session.id,
        visitorId: session.visitorId,
        conversationId: (conversationData as Record<string, string>).id,
        expiresAt: session.expiresAt,
      };
    },

    async touch(identity, now) {
      const timestamp = now.toISOString();
      const [sessionResult, visitorResult] = await Promise.all([
        client
          .from('chat_sessions')
          .update({ last_seen_at: timestamp })
          .eq('id', identity.sessionId),
        client
          .from('chat_visitors')
          .update({ last_seen_at: timestamp })
          .eq('id', identity.visitorId),
      ]);

      if (sessionResult.error || visitorResult.error) {
        throw new Error('Chat session touch failed');
      }
    },
  };
}
