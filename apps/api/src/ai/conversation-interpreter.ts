import OpenAI from 'openai';
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

export interface OpenAIConversationInterpreterConfig {
  apiKey: string;
  model?: string;
  client?: OpenAI;
  maxRecentMessages?: number;
}

const INTERPRETER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['replyText', 'facts'],
  properties: {
    replyText: { type: 'string', minLength: 1, maxLength: 4000 },
    facts: { type: 'object', additionalProperties: true },
  },
} as const;

function compactContext(input: ConversationInterpreterInput, maxRecentMessages: number) {
  return JSON.stringify({
    knownBriefing: input.knownBriefing,
    recentMessages: (input.recentMessages ?? []).slice(-maxRecentMessages),
    customerText: input.customerText,
  });
}

export function createOpenAIConversationInterpreter(
  config: OpenAIConversationInterpreterConfig,
): ConversationInterpreter {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error('Invalid OpenAI conversation interpreter configuration');
  const model = config.model?.trim() || 'gpt-5-mini';
  const client = config.client ?? new OpenAI({ apiKey });
  const maxRecentMessages = Math.max(0, Math.min(config.maxRecentMessages ?? 8, 12));

  return {
    async interpret(input) {
      const response = await client.responses.create({
        model,
        instructions: [
          'Você é o atendente de criação da Caneca Fácil.',
          'Responda em português brasileiro, de forma humana, curta e útil.',
          'Extraia somente fatos explicitamente fornecidos ou corrigidos pelo cliente.',
          'Nunca decida preço, pagamento, aprovação, produção ou readyToGenerate.',
          'Não invente fatos. O backend calcula prontidão e estados protegidos.',
        ].join(' '),
        input: compactContext(input, maxRecentMessages),
        text: {
          format: {
            type: 'json_schema',
            name: 'caneca_facil_conversation_interpretation',
            strict: true,
            schema: INTERPRETER_SCHEMA,
          },
        },
      });

      if (!response.output_text) throw new Error('OpenAI conversation interpreter returned empty output');
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.output_text);
      } catch {
        throw new Error('OpenAI conversation interpreter returned invalid JSON');
      }
      return validateConversationInterpretation(parsed);
    },
  };
}
