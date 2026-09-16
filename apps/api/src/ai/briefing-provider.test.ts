import { describe, expect, it, vi } from 'vitest';
import { createEmptyBriefing } from '@caneca-facil/core';
import {
  BriefingProviderError,
  createOpenAIBriefingProvider,
  type BriefingResponsesClient,
} from './briefing-provider';

function validProviderJson() {
  return JSON.stringify({
    set: {
      creationMode: 'from_scratch',
      occasion: 'aniversário',
      recipient: 'esposa',
      mainTheme: null,
      desiredStyle: 'minimalista',
      colorPreferences: ['azul'],
      mandatoryText: ['Ana'],
      names: ['Ana'],
      dates: null,
      mandatoryElements: null,
      forbiddenElements: null,
      references: null,
      compositionNotes: null,
      creativeDirection: null,
    },
    replace: {
      creationMode: null,
      occasion: null,
      recipient: null,
      mainTheme: null,
      desiredStyle: null,
      colorPreferences: null,
      mandatoryText: null,
      names: null,
      dates: null,
      mandatoryElements: null,
      forbiddenElements: null,
      references: null,
      compositionNotes: null,
      creativeDirection: null,
    },
    creativeFreedom: false,
    confidenceScore: 0.93,
    ambiguousFields: [],
  });
}

describe('OpenAI briefing provider', () => {
  it('uses one stateless Responses API call with strict structured output', async () => {
    const create = vi.fn(async () => ({ output_text: validProviderJson() }));
    const client: BriefingResponsesClient = { create };
    const provider = createOpenAIBriefingProvider({
      apiKey: 'sk-test',
      model: 'briefing-model-test',
      client,
    });

    const result = await provider.extract({
      previousBriefing: createEmptyBriefing(),
      customerTurn: 'Quero uma caneca de aniversário para minha esposa Ana, estilo minimalista e azul.',
      transcript: [],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'briefing-model-test',
        store: false,
        text: {
          format: expect.objectContaining({
            type: 'json_schema',
            name: 'caneca_facil_briefing_extraction',
            strict: true,
            schema: expect.objectContaining({
              type: 'object',
              additionalProperties: false,
            }),
          }),
        },
      }),
    );
    expect(result).toEqual({
      set: {
        creationMode: 'from_scratch',
        occasion: 'aniversário',
        recipient: 'esposa',
        desiredStyle: 'minimalista',
        colorPreferences: ['azul'],
        mandatoryText: ['Ana'],
        names: ['Ana'],
      },
      replace: {},
      creativeFreedom: false,
      confidenceScore: 0.93,
      ambiguousFields: [],
    });
  });

  it('preserves exact mandatory wording from provider output', async () => {
    const create = vi.fn(async () => ({ output_text: validProviderJson() }));
    const provider = createOpenAIBriefingProvider({
      apiKey: 'sk-test',
      model: 'briefing-model-test',
      client: { create },
    });

    const result = await provider.extract({
      previousBriefing: createEmptyBriefing(),
      customerTurn: 'Escreva exatamente Ana',
      transcript: [],
    });

    expect(result.set.mandatoryText).toEqual(['Ana']);
  });

  it('rejects malformed JSON as a normalized provider error', async () => {
    const provider = createOpenAIBriefingProvider({
      apiKey: 'sk-test',
      model: 'briefing-model-test',
      client: { create: vi.fn(async () => ({ output_text: '{not-json' })) },
    });

    await expect(
      provider.extract({
        previousBriefing: createEmptyBriefing(),
        customerTurn: 'Teste',
        transcript: [],
      }),
    ).rejects.toBeInstanceOf(BriefingProviderError);
  });

  it('rejects unknown fields and invalid confidence values', async () => {
    const unknownField = JSON.parse(validProviderJson()) as Record<string, unknown>;
    unknownField.extra = 'nope';

    const providerWithUnknownField = createOpenAIBriefingProvider({
      apiKey: 'sk-test',
      model: 'briefing-model-test',
      client: {
        create: vi.fn(async () => ({ output_text: JSON.stringify(unknownField) })),
      },
    });

    await expect(
      providerWithUnknownField.extract({
        previousBriefing: createEmptyBriefing(),
        customerTurn: 'Teste',
        transcript: [],
      }),
    ).rejects.toBeInstanceOf(BriefingProviderError);

    const invalidConfidence = JSON.parse(validProviderJson()) as Record<string, unknown>;
    invalidConfidence.confidenceScore = 2;

    const providerWithInvalidConfidence = createOpenAIBriefingProvider({
      apiKey: 'sk-test',
      model: 'briefing-model-test',
      client: {
        create: vi.fn(async () => ({
          output_text: JSON.stringify(invalidConfidence),
        })),
      },
    });

    await expect(
      providerWithInvalidConfidence.extract({
        previousBriefing: createEmptyBriefing(),
        customerTurn: 'Teste',
        transcript: [],
      }),
    ).rejects.toBeInstanceOf(BriefingProviderError);
  });
});
