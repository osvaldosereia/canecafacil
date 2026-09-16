import type {
  Briefing,
  BriefingExtraction,
  ChatComponentEnvelopeV1,
} from '@caneca-facil/core';

export type ConversationIntent =
  | 'create_mug'
  | 'correct_briefing'
  | 'answer_question'
  | 'request_human'
  | 'other';

export interface ConversationInterpretation {
  extraction: BriefingExtraction;
  intent: ConversationIntent;
  suggestedReply: string | null;
  suggestedComponents: ChatComponentEnvelopeV1 | null;
}

export interface ConversationInterpreterInput {
  customerTurn: string;
  previousBriefing: Briefing;
  recentTranscript: Array<{
    sender: 'customer' | 'ai';
    text: string;
  }>;
}

export interface ConversationInterpreter {
  interpret(
    input: ConversationInterpreterInput,
  ): Promise<ConversationInterpretation>;
}
