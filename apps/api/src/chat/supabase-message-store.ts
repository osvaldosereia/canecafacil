import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatMessageStore } from './message-store.js';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_type: ChatMessage['senderType'];
  message_kind: ChatMessage['messageKind'];
  text_content: string | null;
  structured_content: Record<string, unknown> | null;
  client_message_id: string | null;
  reply_to_message_id: string | null;
  processing_state: ChatMessage['processingState'];
  created_at: string;
  updated_at: string;
};

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    messageKind: row.message_kind,
    textContent: row.text_content,
    structuredContent: row.structured_content ?? {},
    clientMessageId: row.client_message_id,
    replyToMessageId: row.reply_to_message_id,
    processingState: row.processing_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export function createSupabaseChatMessageStore(
  client: SupabaseClient,
): ChatMessageStore {
  return {
    async createCustomerText(input) {
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          sender_type: 'customer',
          message_kind: 'text',
          text_content: input.text,
          structured_content: {},
          client_message_id: input.clientMessageId,
          reply_to_message_id: null,
          processing_state: 'completed',
        })
        .select('*')
        .single();

      if (!error && data) return { accepted: true, message: mapMessage(data as MessageRow) };
      if (!isUniqueViolation(error)) {
        throw new Error(`Failed to persist customer chat message: ${error?.message ?? 'unknown error'}`);
      }

      const existing = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', input.conversationId)
        .eq('client_message_id', input.clientMessageId)
        .maybeSingle();

      if (existing.error || !existing.data) throw new Error('Duplicate chat message exists but could not be resolved');
      return { accepted: false, message: mapMessage(existing.data as MessageRow) };
    },

    async ensureAssistantDraft(input) {
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          sender_type: 'ai',
          message_kind: 'text',
          text_content: null,
          structured_content: {},
          client_message_id: null,
          reply_to_message_id: input.replyToMessageId,
          processing_state: 'processing',
        })
        .select('*')
        .single();

      if (!error && data) return { reused: false, message: mapMessage(data as MessageRow) };
      if (!isUniqueViolation(error)) {
        throw new Error(`Failed to persist assistant chat draft: ${error?.message ?? 'unknown error'}`);
      }

      const existing = await client
        .from('messages')
        .select('*')
        .eq('reply_to_message_id', input.replyToMessageId)
        .maybeSingle();

      if (existing.error || !existing.data) throw new Error('Assistant draft exists but could not be resolved');
      return { reused: true, message: mapMessage(existing.data as MessageRow) };
    },

    async completeAssistant(messageId, text, structuredContent = {}) {
      const { data, error } = await client
        .from('messages')
        .update({
          text_content: text,
          structured_content: structuredContent,
          processing_state: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to complete assistant message: ${error?.message ?? 'unknown error'}`);
      }
      return mapMessage(data as MessageRow);
    },

    async failAssistant(messageId) {
      const { error } = await client
        .from('messages')
        .update({ processing_state: 'failed', updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw new Error(`Failed to mark assistant message as failed: ${error.message}`);
    },

    async listConversation(conversationId) {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to load conversation history: ${error.message}`);
      return (data ?? []).map((row) => mapMessage(row as MessageRow));
    },
  };
}
