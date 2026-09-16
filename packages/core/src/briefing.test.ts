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

describe('conversational briefing domain', () => {
  it('preserves unrelated facts when one field is explicitly corrected', () => {
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

  it('does not silently overwrite populated scalar facts through set', () => {
    const previous = createEmptyBriefing();
    previous.desiredStyle = 'minimalista';

    const next = mergeBriefing(
      previous,
      extraction({ set: { desiredStyle: 'vintage' } }),
    );

    expect(next.desiredStyle).toBe('minimalista');
  });

  it('merges array facts without duplicates while preserving exact mandatory wording', () => {
    const previous = createEmptyBriefing();
    previous.mandatoryText = ['Ana'];
    previous.names = ['Ana'];

    const next = mergeBriefing(
      previous,
      extraction({
        set: {
          mandatoryText: ['Ana', 'Te amo!'],
          names: ['Ana', 'João'],
        },
      }),
    );

    expect(next.mandatoryText).toEqual(['Ana', 'Te amo!']);
    expect(next.names).toEqual(['Ana', 'João']);
  });

  it('persists creative freedom until explicitly changed', () => {
    const initial = createEmptyBriefing();
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

    expect(initial.creativeFreedom).toBe(false);
    expect(granted.creativeFreedom).toBe(true);
    expect(later.creativeFreedom).toBe(true);
    expect(revoked.creativeFreedom).toBe(false);
  });

  it('requires creation mode, creative context and a style decision deterministically', () => {
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

  it('requires a reference when reference mode is selected', () => {
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

  it('does not let provider confidence override deterministic readiness', () => {
    const briefing = mergeBriefing(
      createEmptyBriefing(),
      extraction({ confidenceScore: 1 }),
    );

    expect(briefing.confidenceScore).toBe(1);
    expect(briefing.readyToGenerate).toBe(false);
  });

  it('asks exactly one next question using deterministic priority', () => {
    const referenceBriefing = createEmptyBriefing();

    expect(getNextBriefingQuestion(referenceBriefing)?.key).toBe('creation_mode');

    referenceBriefing.creationMode = 'reference';
    expect(getNextBriefingQuestion(referenceBriefing)?.key).toBe('reference');

    referenceBriefing.references.push({ mediaId: 'media-1', order: 1 });
    expect(getNextBriefingQuestion(referenceBriefing)?.key).toBe(
      'style_or_creative_freedom',
    );

    referenceBriefing.creativeFreedom = true;
    expect(getNextBriefingQuestion(referenceBriefing)).toBeNull();

    const fromScratch = createEmptyBriefing();
    fromScratch.creationMode = 'from_scratch';
    expect(getNextBriefingQuestion(fromScratch)?.key).toBe('creative_context');
  });
});
