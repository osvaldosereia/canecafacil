import type { Briefing } from '@caneca-facil/core';

export type ConversationAutomationMode = 'ai' | 'human' | 'paused';

export interface ConversationBriefingContext {
  conversationId: string;
  automationMode: ConversationAutomationMode;
  projectId: string | null;
  briefingId: string | null;
  briefing: Briefing;
}

export interface ConversationBriefingStore {
  load(conversationId: string): Promise<ConversationBriefingContext>;
  saveVersion(input: {
    conversationId: string;
    projectId: string;
    previousBriefingId: string | null;
    briefing: Briefing;
  }): Promise<{ briefingId: string; version: number }>;
}
