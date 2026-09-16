import type { Briefing } from '@caneca-facil/core';

export interface BriefingState {
  projectId: string;
  briefingId: string;
  version: number;
  briefing: Briefing;
}

export interface AppendBriefingVersionInput {
  conversationId: string;
  projectId: string;
  expectedVersion: number;
  briefing: Briefing;
}

export interface BriefingStore {
  loadOrCreate(conversationId: string): Promise<BriefingState>;
  appendVersion(input: AppendBriefingVersionInput): Promise<BriefingState>;
}

export class BriefingVersionConflictError extends Error {
  constructor(message = 'Briefing version conflict') {
    super(message);
    this.name = 'BriefingVersionConflictError';
  }
}
