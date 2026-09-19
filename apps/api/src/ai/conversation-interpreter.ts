import OpenAI from 'openai';
import type { BriefingPatch, BriefingReference } from '@caneca-facil/core';
import {
  validateChatComponentEnvelope,
  type ChatComponentEnvelope,
} from '@caneca-facil/core';

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

const FACT_KEYS = new Set([
  'creationMode',
  'occasion',
  'recipient',
  'mainTheme',
  'desiredStyle',
  'colorPreferences',
  'mandatoryText',
  'names',
  'dates',
  'mandatoryElements',
  'forbiddenElements',
  'references',
  'compositionNotes',
  'creativeDirection',
]);

function optionalString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`invalid briefing fact: ${field}`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid briefing fact: ${field}`);
  return normalized;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`invalid briefing fact: ${field}`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function references(value: unknown): BriefingReference[] {
  if (!Array.isArray(value)) throw new Error('invalid briefing fact: references');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('invalid briefing reference');
    }
    const raw = item as Record<string, unknown>;
    const mediaId = optionalString(raw.mediaId, 'references.mediaId');
    const order = Number(raw.order);
    if (!Number.isInteger(order) || order < 1) {
      throw new Error('invalid briefing fact: references.order');
    }
    return {
      mediaId,
      order,
      ...(raw.role === undefined
        ? {}
        : { role: optionalString(raw.role, 'references.role') }),
    };
  });
}

export function validateBriefingPatch(value: unknown): BriefingPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid interpreter facts');
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!FACT_KEYS.has(key)) {
      throw new Error(`unsupported briefing fact: ${key}`);
    }
  }

  const patch: BriefingPatch = {};
  if (raw.creationMode !== undefined) {
    if (raw.creationMode !== 'reference' && raw.creationMode !== 'from_scratch') {
      throw new Error('invalid briefing fact: creationMode');
    }
    patch.creationMode = raw.creationMode;
  }

  for (const key of [
    'occasion',
    'recipient',
    'mainTheme',
    'desiredStyle',
    'compositionNotes',
    'creativeDirection',
  ] as const) {
    if (raw[key] !== undefined) patch[key] = optionalString(raw[key], key);
  }

  for (const key of [
    'colorPreferences',
    'mandatoryText',
    'names',
    'dates',
    'mandatoryElements',
    'forbiddenElements',
  ] as const) {
    if (raw[key] !== undefined) patch[key] = stringArray(raw[key], key);
  }

  if (raw.references !== undefined) patch.references = references(raw.references);
  return patch;
}

export function validateConversationInterpretation(value: unknown): ConversationInterpretation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid conversation interpretation');
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.replyText !== 'string' ||
    !raw.replyText.trim() ||
    raw.replyText.length > 4000
  ) {
    throw new Error('invalid interpreter reply');
  }

  const facts = validateBriefingPatch(raw.facts);
  const components =
    raw.components === undefined
      ? undefined
      : validateChatComponentEnvelope(raw.components);

  return {
    replyText: raw.replyText.trim(),
    facts,
    ...(components ? { components } : {}),
  };
}

export function createDeterministicConversationInterpreter(
  factory?: (input: ConversationInterpreterInput) => ConversationInterpretation,
): ConversationInterpreter {
  return {
    async interpret(input) {
      return validateConversationInterpretation(
        factory?.(input) ?? {
          replyText:
            'Entendi. Me conte mais um detalhe para eu deixar sua caneca do jeito que você imagina.',
          facts: {},
        },
      );
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
    components: { type: 'object', additionalProperties: true },
  },
} as const;

function compactContext(
  input: ConversationInterpreterInput,
  maxRecentMessages: number,
) {
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
  if (!apiKey) {
    throw new Error('Invalid OpenAI conversation interpreter configuration');
  }
  const model = config.model?.trim() || 'gpt-5.6-luna';
  const client = config.client ?? new OpenAI({ apiKey });
  const maxRecentMessages = Math.max(
    0,
    Math.min(config.maxRecentMessages ?? 8, 12),
  );

  return {
    async interpret(input) {
      const response = await client.responses.create({
        model,
        instructions: [
          'Você é o atendente de criação da Caneca Fácil.',
          'Responda em português brasileiro, de forma humana, curta e útil.',
          'Extraia somente fatos explicitamente fornecidos ou corrigidos pelo cliente.',
          'Use apenas os campos de briefing autorizados no contexto.',
          'Nunca decida preço, pagamento, aprovação, produção, confidenceScore, missingInformation ou readyToGenerate.',
          'Não invente fatos. O backend calcula prontidão e estados protegidos.',
          'Componentes são opcionais e devem usar somente o protocolo permitido pela aplicação.',
        ].join(' '),
        input: compactContext(input, maxRecentMessages),
        text: {
          format: {
            type: 'json_schema',
            name: 'caneca_facil_conversation_interpretation',
            strict: false,
            schema: INTERPRETER_SCHEMA,
          },
        },
      });

      if (!response.output_text) {
        throw new Error('OpenAI conversation interpreter returned empty output');
      }

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
