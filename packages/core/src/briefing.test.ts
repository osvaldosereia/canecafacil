import { describe, expect, it } from 'vitest';
import {
  createEmptyBriefing,
  getMissingBriefingInformation,
  getNextBriefingQuestion,
  isBriefingReady,
  mergeBriefing,
  type BriefingExtraction,
} from './briefing';

function extraction(
  overrides: Partial<BriefingExtraction> = {},
): BriefingExtraction {
  return {
    set: {},
    replace: {},
    confidenceScore: 0.8,
    ambiguousFields: [],
    ...overrides,
  };
}

describe('briefing domain', () => {
  it('preserves known facts and replaces only an explicitly corrected field', () => {
    const previous = createEmptyBriefing();
    previous.creationMode = 'from_scratch';
    previous.desiredStyle = 'minimalista';
    previous.colorPreferences = ['azul'];

    const next = mergeBriefing(
      previous,
      extraction({
        set: { occasion: 'aniversário' },
        replace: { colorPreferences: ['rosa'] },
        confidenceScore: 0.91,
      }),
    );

    expect(next.desiredStyle).toBe('minimalista');
    expect(next.colorPreferences).toEqual(['rosa']);
    expect(next.occasion).toBe('aniversário');
    expect(next.confidenceScore).toBe(0.91);
  });

  it('persists creative freedom until it is explicitly changed', () => {
    const initial = createEmptyBriefing();
    expect(initial.creativeFreedom).toBe(false);

    const granted = mergeBriefing(
      initial,
      extraction({ creativeFreedom: true }),
    );
    const later = mergeBriefing(
      granted,
      extraction({ set: { occasion: 'presente' } }),
    );
    const revoked = mergeBriefing(
      later,
      extraction({ creativeFreedom: false }),
    );

    expect(granted.creativeFreedom).toBe(true);
    expect(later.creativeFreedom).toBe(true);
    expect(revoked.creativeFreedom).toBe(false);
  });

  it('merges array facts without duplicates and preserves mandatory text exactly', () => {
    const previous = createEmptyBriefing();
    previous.mandatoryText = ['Ana'];
    previous.names = ['Ana'];

    const next = mergeBriefing(
      previous,
      extraction({
        set: {
          mandatoryText: ['Ana', 'Te amo'],
          names: ['Ana', 'João'],
        },
      }),
    );

    expect(next.mandatoryText).toEqual(['Ana', 'Te amo']);
    expect(next.names).toEqual(['Ana', 'João']);
    expect(next.mandatoryText[0]).toBe('Ana');
  });

  it('does not silently overwrite an existing scalar through set', () => {
    const previous = createEmptyBriefing();
    previous.desiredStyle = 'minimalista';

    const next = mergeBriefing(
      previous,
      extraction({ set: { desiredStyle: 'vintage' } }),
    );

    expect(next.desiredStyle).toBe('minimalista');
  });

  it('requires creation mode, creative context and a resolved style decision', () => {
    const briefing = createEmptyBriefing();

    expect(getMissingBriefingInformation(briefing)).toEqual([
      'creation_mode',
      'creative_context',
      'style_or_creative_freedom',
    ]);
    expect(isBriefingReady(briefing)).toBe(false);

    briefing.creationMode = 'from_scratch';
    briefing.recipient = 'esposa';
    briefing.desiredStyle = 'minimalista';

    expect(getMissingBriefingInformation(briefing)).toEqual([]);
    expect(isBriefingReady(briefing)).toBe(true);
  });

  it('requires a reference when creation mode is reference', () => {
    const briefing = createEmptyBriefing();
    briefing.creationMode = 'reference';
    briefing.recipient = 'amigo';
    briefing.creativeFreedom = true;

    expect(getMissingBriefingInformation(briefing)).toContain('reference');
    expect(isBriefingReady(briefing)).toBe(false);

    briefing.references.push({ mediaId: 'media-1', order: 1 });

    expect(getMissingBriefingInformation(briefing)).toEqual([]);
    expect(isBriefingReady(briefing)).toBe(true);
  });

  it('does not let provider confidence override deterministic requirements', () => {
    const briefing = mergeBriefing(
      createEmptyBriefing(),
      extraction({ confidenceScore: 1 }),
    );

    expect(briefing.confidenceScore).toBe(1);
    expect(briefing.readyToGenerate).toBe(false);
    expect(isBriefingReady(briefing)).toBe(false);
  });

  it('asks exactly one next question using deterministic priority', () => {
    const referenceBriefing = createEmptyBriefing();

    expect(getNextBriefingQuestion(referenceBriefing)).toBe(
      'Você já tem uma imagem ou modelo como referência, ou quer criar a caneca do zero?',
    );

    referenceBriefing.creationMode = 'reference';
    expect(getNextBriefingQuestion(referenceBriefing)).toBe(
      'Envie a imagem que você quer usar como referência para a caneca.',
    );

    referenceBriefing.references.push({ mediaId: 'media-1', order: 1 });
    expect(getNextBriefingQuestion(referenceBriefing)).toBe(
      'Você prefere algum estilo específico ou posso criar com liberdade?',
    );

    referenceBriefing.creativeFreedom = true;
    expect(getNextBriefingQuestion(referenceBriefing)).toBeNull();

    const fromScratch = createEmptyBriefing();
    fromScratch.creationMode = 'from_scratch';
    expect(getNextBriefingQuestion(fromScratch)).toBe(
      'Para quem ou para qual ocasião é a caneca? Pode me contar a ideia principal.',
    );
  });
});
