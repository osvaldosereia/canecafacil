export type ChatSenderType = 'customer' | 'ai' | 'human' | 'system' | 'automation';
export type ChatMessageKind = 'text' | 'image' | 'audio' | 'document' | 'system' | 'component' | 'notice';
export type ChatProcessingState = 'received' | 'processing' | 'completed' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  messageKind: ChatMessageKind;
  textContent: string | null;
  structuredContent: Record<string, unknown>;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  processingState: ChatProcessingState;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageStore {
  createCustomerText(input: {
    conversationId: string;
    clientMessageId: string;
    text: string;
  }): Promise<{ accepted: boolean; message: ChatMessage }>;
  ensureAssistantDraft(input: {
    conversationId: string;
    replyToMessageId: string;
  }): Promise<{ reused: boolean; message: ChatMessage }>;
  completeAssistant(messageId: string, text: string): Promise<ChatMessage>;
  failAssistant(messageId: string): Promise<void>;
  listConversation(conversationId: string): Promise<ChatMessage[]>;
}
