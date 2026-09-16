export interface ChatSessionIdentity {
  sessionId: string;
  visitorId: string;
  conversationId: string;
  expiresAt: string;
}

export interface ChatSessionStore {
  create(tokenHash: string, expiresAt: Date): Promise<ChatSessionIdentity>;
  resolve(tokenHash: string, now: Date): Promise<ChatSessionIdentity | null>;
  touch(identity: ChatSessionIdentity, now: Date): Promise<void>;
}
