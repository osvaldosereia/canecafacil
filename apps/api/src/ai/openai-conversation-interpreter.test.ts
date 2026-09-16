import { createEmptyBriefing } from '@caneca-facil/core';
import { describe, expect, it, vi } from 'vitest';
import {
  ConversationInterpreterError,
  createOpenAIConversationInterpreter,
} from './openai-conversation-interpreter.js';

function validProviderPayload() {
  return {
    intent: 'create_mug',
    suggestedReply: 'Entendi. Vou organizar sua ideia.',
    extraction: {
      operations: [
        {
          field: 'occasion',
          mode: 'set',
          stringValue: 'aniversário',
          stringListValue: [],
          booleanValue: null,
        },
        {
          field: 'recipient',
          mode: 'set',
          stringValue: 'Ana',
          stringListValue: [],
          booleanValue: null,
        },
        {
          field: 'mandatoryText',
          mode: 'set',
          stringValue: null,
          stringListValue: ['Ana & João'],
          booleanValue: null,
        },
      ],
      confidenceScore: 0.94,
      ambiguousFields: [],
    },
    uiSuggestion: {
      kind: 'creation_mode',
      notice: null,
    },
  };
}

function fakeClient(output: unknown) {
  const create = vi.fn().mockResolvedValue({
    output_text:
      typeof output === 'string' ? output : JSON.stringify(output),
  });
  return { client: { responses: { create } }, create };
}

describe('OpenAI conversation interpreter', () => {
  it('uses one stateless strict Responses API call and maps validated output', async () => {
    const { client, create } = fakeClient(validProviderPayload());
    const interpreter = createOpenAIConversationInterpreter({
      client,
      model: 'gpt-5.6-luna',
    });

    const result = await interpreter.interpret({
      customerTurn: 'É para o aniversário da Ana e precisa escrito Ana & João.',
      previousBriefing: createEmptyBriefing(),
      recentTranscript: [
        { sender: 'ai', text: 'Me conta sua ideia para a caneca.' },
      ],
    });

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0]?.[0] as Record<string, any>;
    expect(request.model).toBe('gpt-5.6-luna');
    expect(request.store).toBe(false);
    expect(request.text?.format?.type).toBe('json_schema');
    expect(request.text?.format?.strict).toBe(true);
    expect(request.text?.format?.schema?.additionalProperties).toBe(false);
    expect(JSON.stringify(request.text?.format?.schema)).not.toMatch(
      /reasoning|chain[_ -]?of[_ -]?thought|scratchpad/i,
    );

    expect(result).toEqual({
      intent: 'create_mug',
      suggestedReply: 'Entendi. Vou organizar sua ideia.',
      extraction: {
        set: {
          occasion: 'aniversário',
          recipient: 'Ana',
          mandatoryText: ['Ana & João'],
        },
        replace: {},
        confidenceScore: 0.94,
        ambiguousFields: [],
      },
      suggestedComponents: {
        version: 1,
        components: [
          {
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
          },
        ],
      },
    });
  });

  it('preserves exact customer wording instead of rewriting mandatory text', async () => {
    const payload = validProviderPayload();
    payload.extraction.operations = [
      {
        field: 'mandatoryText',
        mode: 'set',
        stringValue: null,
        stringListValue: ['Vovó Célia — 80 anos'],
        booleanValue: null,
      },
    ];
    const { client } = fakeClient(payload);
    const interpreter = createOpenAIConversationInterpreter({
      client,
      model: 'gpt-5.6-luna',
    });

    const result = await interpreter.interpret({
      customerTurn: 'Tem que estar exatamente: Vovó Célia — 80 anos',
      previousBriefing: createEmptyBriefing(),
      recentTranscript: [],
    });

    expect(result.extraction.set.mandatoryText).toEqual([
      'Vovó Célia — 80 anos',
    ]);
  });

  it.each([
    ['malformed JSON', '{not-json'],
    [
      'unknown root keys',
      { ...validProviderPayload(), hiddenReasoning: 'private thoughts' },
    ],
    [
      'invalid confidence',
      {
        ...validProviderPayload(),
        extraction: {
          ...validProviderPayload().extraction,
          confidenceScore: 1.5,
        },
      },
    ],
    [
      'unsupported extraction field',
      {
        ...validProviderPayload(),
        extraction: {
          ...validProviderPayload().extraction,
          operations: [
            {
              field: 'references',
              mode: 'set',
              stringValue: 'invented-media-id',
              stringListValue: [],
              booleanValue: null,
            },
          ],
        },
      },
    ],
    [
      'invalid UI request',
      {
        ...validProviderPayload(),
        uiSuggestion: { kind: 'raw_html', notice: null },
      },
    ],
  ])('rejects %s through the local validation boundary', async (_label, payload) => {
    const { client } = fakeClient(payload);
    const interpreter = createOpenAIConversationInterpreter({
      client,
      model: 'gpt-5.6-luna',
    });

    await expect(
      interpreter.interpret({
        customerTurn: 'Mensagem',
        previousBriefing: createEmptyBriefing(),
        recentTranscript: [],
      }),
    ).rejects.toBeInstanceOf(ConversationInterpreterError);
  });

  it('normalizes provider failures without leaking provider details', async () => {
    const create = vi.fn().mockRejectedValue(
      new Error('Authorization: Bearer sk-secret-should-not-leak'),
    );
    const interpreter = createOpenAIConversationInterpreter({
      client: { responses: { create } },
      model: 'gpt-5.6-luna',
    });

    await expect(
      interpreter.interpret({
        customerTurn: 'Mensagem',
        previousBriefing: createEmptyBriefing(),
        recentTranscript: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ConversationInterpreterError',
        message: 'Conversation interpretation failed',
      }),
    );
  });
});
