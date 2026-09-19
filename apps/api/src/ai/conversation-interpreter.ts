import type { BriefingPatch } from '@caneca-facil/core';
import { validateChatComponentEnvelope, type ChatComponentEnvelope } from '@caneca-facil/core';

export interface ConversationInterpreterInput {
  customerText: string;
  knownBriefing: Record<string, unknown>;
  recentMessages?: Array<{ senderType: string; text: string }>;
}

export interface ConversationInterpretation {
  replyText: string;
  facts: BriefingPatch;
  components?: ChatComponentEnvelope;
}

export interface ConversationInterpreter {
  interpret(input: ConversationInterpreterInput): Promise<ConversationInterpretation>;
}

export function validateConversationInterpretation(value: unknown): ConversationInterpretation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid conversation interpretation');
  const raw = value as Record<string, unknown>;
  if (typeof raw.replyText !== 'string' || !raw.replyText.trim() || raw.replyText.length > 4000) throw new Error('invalid interpreter reply');
  if (!raw.facts || typeof raw.facts !== 'object' || Array.isArray(raw.facts)) throw new Error('invalid interpreter facts');
  const components = raw.components === undefined ? undefined : validateChatComponentEnvelope(raw.components);
  return { replyText: raw.replyText.trim(), facts: raw.facts as BriefingPatch, ...(components ? { components } : {}) };
}

export function createDeterministicConversationInterpreter(
  factory?: (input: ConversationInterpreterInput) => ConversationInterpretation,
): ConversationInterpreter {
  return {
    async interpret(input) {
      return validateConversationInterpretation(factory?.(input) ?? {
        replyText: 'Entendi. Me conte mais um detalhe para eu deixar sua caneca do jeito que você imagina.',
        facts: {},
      });
    },
  };
}
