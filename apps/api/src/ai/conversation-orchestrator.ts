import { getBriefingEvaluation, mergeBriefing, type Briefing } from '@caneca-facil/core';
import type { ChatComponentEnvelope } from '@caneca-facil/core';
import type { ConversationBriefingStore } from './briefing-store.js';
import type { ConversationInterpreter } from './conversation-interpreter.js';

export interface ConversationOrchestrationResult {
  mode: 'ai' | 'human' | 'paused';
  replyText: string | null;
  components?: ChatComponentEnvelope;
  briefing: Briefing;
  briefingChanged: boolean;
  briefingId: string | null;
}

export interface ConversationOrchestrator {
  handle(input: {
    conversationId: string;
    customerText: string;
    recentMessages?: Array<{ senderType: string; text: string }>;
  }): Promise<ConversationOrchestrationResult>;
}

function sameBriefing(a: Briefing, b: Briefing): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createConversationOrchestrator(input: {
  interpreter: ConversationInterpreter;
  briefingStore: ConversationBriefingStore;
}): ConversationOrchestrator {
  return {
    async handle(turn) {
      const context = await input.briefingStore.load(turn.conversationId);
      if (context.automationMode !== 'ai') {
        return {
          mode: context.automationMode,
          replyText: null,
          briefing: context.briefing,
          briefingChanged: false,
          briefingId: context.briefingId,
        };
      }

      const interpretation = await input.interpreter.interpret({
        customerText: turn.customerText,
        knownBriefing: context.briefing as unknown as Record<string, unknown>,
        recentMessages: turn.recentMessages,
      });

      const merged = mergeBriefing(context.briefing, interpretation.facts);
      const evaluation = getBriefingEvaluation(merged);
      const briefing = { ...merged, ...evaluation };
      const briefingChanged = !sameBriefing(context.briefing, briefing);
      let briefingId = context.briefingId;

      if (briefingChanged && context.projectId) {
        const saved = await input.briefingStore.saveVersion({
          conversationId: turn.conversationId,
          projectId: context.projectId,
          previousBriefingId: context.briefingId,
          briefing,
        });
        briefingId = saved.briefingId;
      }

      const replyText = evaluation.nextQuestion && !briefing.readyToGenerate
        ? `${interpretation.replyText}\n\n${evaluation.nextQuestion}`
        : interpretation.replyText;

      return {
        mode: 'ai',
        replyText,
        components: interpretation.components,
        briefing,
        briefingChanged,
        briefingId,
      };
    },
  };
}
