import {
  parseChatComponentEnvelope,
  type BriefingEditableFields,
  type BriefingExtraction,
  type BriefingField,
  type ChatComponentEnvelopeV1,
} from '@caneca-facil/core';
import type {
  ConversationInterpretation,
  ConversationInterpreter,
  ConversationInterpreterInput,
  ConversationIntent,
} from './conversation-interpreter.js';

export interface ConversationResponsesClient {
  responses: {
    create(input: Record<string, unknown>): Promise<{
      output_text?: string | null;
    }>;
  };
}

export class ConversationInterpreterError extends Error {
  constructor(message = 'Conversation interpretation failed') {
    super(message);
    this.name = 'ConversationInterpreterError';
  }
}

type ExtractableField =
  | BriefingField
  | 'creativeFreedom';

type ProviderOperation = {
  field: ExtractableField;
  mode: 'set' | 'replace';
  stringValue: string | null;
  stringListValue: string[];
  booleanValue: boolean | null;
};

type ProviderPayload = {
  intent: ConversationIntent;
  suggestedReply: string | null;
  extraction: {
    operations: ProviderOperation[];
    confidenceScore: number;
    ambiguousFields: BriefingField[];
  };
  uiSuggestion: {
    kind: 'none' | 'creation_mode' | 'reference_upload' | 'human_help';
    notice: string | null;
  };
};

const STRING_FIELDS = new Set<ExtractableField>([
  'creationMode',
  'occasion',
  'recipient',
  'mainTheme',
  'desiredStyle',
  'compositionNotes',
  'creativeDirection',
]);

const LIST_FIELDS = new Set<ExtractableField>([
  'colorPreferences',
  'mandatoryText',
  'names',
  'dates',
  'mandatoryElements',
  'forbiddenElements',
]);

const EXTRACTABLE_FIELDS: ExtractableField[] = [
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
  'compositionNotes',
  'creativeDirection',
  'creativeFreedom',
];

const AMBIGUOUS_FIELDS: BriefingField[] = [
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
  'compositionNotes',
  'creativeDirection',
];

const INTENTS: ConversationIntent[] = [
  'create_mug',
  'correct_briefing',
  'answer_question',
  'request_human',
  'other',
];

const UI_KINDS = [
  'none',
  'creation_mode',
  'reference_upload',
  'human_help',
] as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: INTENTS,
    },
    suggestedReply: {
      type: ['string', 'null'],
      maxLength: 600,
    },
    extraction: {
      type: 'object',
      additionalProperties: false,
      properties: {
        operations: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              field: {
                type: 'string',
                enum: EXTRACTABLE_FIELDS,
              },
              mode: {
                type: 'string',
                enum: ['set', 'replace'],
              },
              stringValue: {
                type: ['string', 'null'],
                maxLength: 2000,
              },
              stringListValue: {
                type: 'array',
                maxItems: 20,
                items: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 300,
                },
              },
              booleanValue: {
                type: ['boolean', 'null'],
              },
            },
            required: [
              'field',
              'mode',
              'stringValue',
              'stringListValue',
              'booleanValue',
            ],
          },
        },
        confidenceScore: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        ambiguousFields: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: AMBIGUOUS_FIELDS,
          },
        },
      },
      required: ['operations', 'confidenceScore', 'ambiguousFields'],
    },
    uiSuggestion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: UI_KINDS,
        },
        notice: {
          type: ['string', 'null'],
          maxLength: 240,
        },
      },
      required: ['kind', 'notice'],
    },
  },
  required: ['intent', 'suggestedReply', 'extraction', 'uiSuggestion'],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedText(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    value.trim().length > 0
  );
}

function parseStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: string[] = [];
  for (const item of value) {
    if (!isBoundedText(item, 300)) return null;
    result.push(item);
  }
  return result;
}

function parseOperation(value: unknown): ProviderOperation | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, [
      'field',
      'mode',
      'stringValue',
      'stringListValue',
      'booleanValue',
    ])
  ) {
    return null;
  }

  if (
    typeof value.field !== 'string' ||
    !EXTRACTABLE_FIELDS.includes(value.field as ExtractableField)
  ) {
    return null;
  }
  const field = value.field as ExtractableField;

  if (value.mode !== 'set' && value.mode !== 'replace') return null;

  const stringValue = value.stringValue;
  const stringListValue = parseStringList(value.stringListValue);
  const booleanValue = value.booleanValue;
  if (stringListValue === null) return null;
  if (
    stringValue !== null &&
    !isBoundedText(stringValue, 2000)
  ) {
    return null;
  }
  if (booleanValue !== null && typeof booleanValue !== 'boolean') return null;

  if (STRING_FIELDS.has(field)) {
    if (stringValue === null || stringListValue.length > 0 || booleanValue !== null) {
      return null;
    }
    if (
      field === 'creationMode' &&
      stringValue !== 'reference' &&
      stringValue !== 'from_scratch'
    ) {
      return null;
    }
  } else if (LIST_FIELDS.has(field)) {
    if (stringValue !== null || booleanValue !== null) return null;
    if (value.mode === 'set' && stringListValue.length === 0) return null;
  } else if (field === 'creativeFreedom') {
    if (
      booleanValue === null ||
      stringValue !== null ||
      stringListValue.length > 0
    ) {
      return null;
    }
  } else {
    return null;
  }

  return {
    field,
    mode: value.mode,
    stringValue,
    stringListValue,
    booleanValue,
  };
}

function parseProviderPayload(value: unknown): ProviderPayload | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, [
      'intent',
      'suggestedReply',
      'extraction',
      'uiSuggestion',
    ])
  ) {
    return null;
  }

  if (
    typeof value.intent !== 'string' ||
    !INTENTS.includes(value.intent as ConversationIntent)
  ) {
    return null;
  }

  if (
    value.suggestedReply !== null &&
    !isBoundedText(value.suggestedReply, 600)
  ) {
    return null;
  }

  if (!isRecord(value.extraction)) return null;
  if (
    !hasOnlyKeys(value.extraction, [
      'operations',
      'confidenceScore',
      'ambiguousFields',
    ])
  ) {
    return null;
  }

  if (!Array.isArray(value.extraction.operations)) return null;
  if (value.extraction.operations.length > 20) return null;
  const operations: ProviderOperation[] = [];
  for (const rawOperation of value.extraction.operations) {
    const operation = parseOperation(rawOperation);
    if (!operation) return null;
    operations.push(operation);
  }

  if (
    typeof value.extraction.confidenceScore !== 'number' ||
    !Number.isFinite(value.extraction.confidenceScore) ||
    value.extraction.confidenceScore < 0 ||
    value.extraction.confidenceScore > 1
  ) {
    return null;
  }

  if (!Array.isArray(value.extraction.ambiguousFields)) return null;
  const ambiguousFields: BriefingField[] = [];
  const seenAmbiguous = new Set<string>();
  for (const field of value.extraction.ambiguousFields) {
    if (
      typeof field !== 'string' ||
      !AMBIGUOUS_FIELDS.includes(field as BriefingField) ||
      seenAmbiguous.has(field)
    ) {
      return null;
    }
    seenAmbiguous.add(field);
    ambiguousFields.push(field as BriefingField);
  }

  if (!isRecord(value.uiSuggestion)) return null;
  if (!hasOnlyKeys(value.uiSuggestion, ['kind', 'notice'])) return null;
  if (
    typeof value.uiSuggestion.kind !== 'string' ||
    !UI_KINDS.includes(value.uiSuggestion.kind as (typeof UI_KINDS)[number])
  ) {
    return null;
  }
  if (
    value.uiSuggestion.notice !== null &&
    !isBoundedText(value.uiSuggestion.notice, 240)
  ) {
    return null;
  }

  return {
    intent: value.intent as ConversationIntent,
    suggestedReply: value.suggestedReply as string | null,
    extraction: {
      operations,
      confidenceScore: value.extraction.confidenceScore,
      ambiguousFields,
    },
    uiSuggestion: {
      kind: value.uiSuggestion.kind as ProviderPayload['uiSuggestion']['kind'],
      notice: value.uiSuggestion.notice as string | null,
    },
  };
}

function assignEditableField(
  target: Partial<BriefingEditableFields>,
  operation: ProviderOperation,
): void {
  if (operation.field === 'creativeFreedom') return;

  if (STRING_FIELDS.has(operation.field)) {
    (target as Record<string, unknown>)[operation.field] = operation.stringValue;
    return;
  }

  if (LIST_FIELDS.has(operation.field)) {
    (target as Record<string, unknown>)[operation.field] = [
      ...operation.stringListValue,
    ];
  }
}

function toExtraction(payload: ProviderPayload): BriefingExtraction {
  const set: Partial<BriefingEditableFields> = {};
  const replace: Partial<BriefingEditableFields> = {};
  let creativeFreedom: boolean | undefined;

  for (const operation of payload.extraction.operations) {
    if (operation.field === 'creativeFreedom') {
      creativeFreedom = operation.booleanValue ?? undefined;
      continue;
    }
    assignEditableField(operation.mode === 'set' ? set : replace, operation);
  }

  return {
    set,
    replace,
    ...(typeof creativeFreedom === 'boolean' ? { creativeFreedom } : {}),
    confidenceScore: payload.extraction.confidenceScore,
    ambiguousFields: payload.extraction.ambiguousFields,
  };
}

function toComponents(
  suggestion: ProviderPayload['uiSuggestion'],
): ChatComponentEnvelopeV1 | null {
  const components: unknown[] = [];

  switch (suggestion.kind) {
    case 'creation_mode':
      components.push({
        type: 'quick_replies',
        options: [
          {
            id: 'from-scratch',
            label: 'Criar do zero',
            value: 'Quero criar do zero',
          },
          {
            id: 'reference',
            label: 'Tenho uma referência',
            value: 'Tenho uma referência',
          },
        ],
      });
      break;
    case 'reference_upload':
      components.push({
        type: 'upload_request',
        mediaKinds: ['image', 'audio'],
        maxFiles: 3,
        label: 'Enviar referências',
      });
      break;
    case 'human_help':
      components.push({
        type: 'action_buttons',
        buttons: [
          {
            id: 'human-help',
            label: 'Falar com uma pessoa',
            action: 'submit',
            value: 'Quero falar com uma pessoa',
          },
        ],
      });
      break;
    case 'none':
      break;
  }

  if (suggestion.notice) {
    components.push({
      type: 'notice',
      tone: 'info',
      text: suggestion.notice,
    });
  }

  if (components.length === 0) return null;
  const parsed = parseChatComponentEnvelope({ version: 1, components });
  if (!parsed) throw new ConversationInterpreterError();
  return parsed;
}

function compactInput(input: ConversationInterpreterInput): string {
  return JSON.stringify({
    customerTurn: input.customerTurn.slice(0, 4000),
    previousBriefing: input.previousBriefing,
    recentTranscript: input.recentTranscript.slice(-8).map((turn) => ({
      sender: turn.sender,
      text: turn.text.slice(0, 1200),
    })),
  });
}

const INSTRUCTIONS = `You interpret customer messages for Caneca Fácil, a custom mug creation service.
Extract only facts explicitly supported by the customer message or compact context.
Use mode "replace" only when the customer clearly corrects or replaces an existing fact; otherwise use "set".
Never invent media IDs, prices, payment state, production state, dates, names, mandatory wording or business facts.
Preserve exact customer wording for mandatory text, names and dates.
Keep suggestedReply concise, warm and useful. Do not reveal private reasoning or hidden analysis.
UI suggestions are requests only; the backend will construct authorized components.
Return only the structured response required by the supplied schema.`;

export function createOpenAIConversationInterpreter(config: {
  client: ConversationResponsesClient;
  model: string;
}): ConversationInterpreter {
  const model = config.model.trim();
  if (!model) throw new ConversationInterpreterError();

  return {
    async interpret(input): Promise<ConversationInterpretation> {
      try {
        const response = await config.client.responses.create({
          model,
          store: false,
          instructions: INSTRUCTIONS,
          input: compactInput(input),
          text: {
            format: {
              type: 'json_schema',
              name: 'caneca_facil_conversation_interpretation',
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        });

        if (typeof response.output_text !== 'string' || !response.output_text.trim()) {
          throw new ConversationInterpreterError();
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(response.output_text);
        } catch {
          throw new ConversationInterpreterError();
        }

        const payload = parseProviderPayload(decoded);
        if (!payload) throw new ConversationInterpreterError();

        return {
          intent: payload.intent,
          suggestedReply: payload.suggestedReply,
          extraction: toExtraction(payload),
          suggestedComponents: toComponents(payload.uiSuggestion),
        };
      } catch (error) {
        if (error instanceof ConversationInterpreterError) throw error;
        throw new ConversationInterpreterError();
      }
    },
  };
}
