import { describe, expect, it } from 'vitest';
import { correctBriefingField, createEmptyBriefing, getBriefingEvaluation, mergeBriefing } from './briefing';

describe('deterministic briefing engine', () => {
  it('preserves unrelated known facts while merging newly extracted facts', () => {
    const current = mergeBriefing(createEmptyBriefing(), { recipient: 'Ana', mainTheme: 'flores' });
    const next = mergeBriefing(current, { desiredStyle: 'aquarela' });
    expect(next.recipient).toBe('Ana');
    expect(next.mainTheme).toBe('flores');
    expect(next.desiredStyle).toBe('aquarela');
    expect(next.readyToGenerate).toBe(true);
  });

  it('corrects only the explicitly targeted field', () => {
    const current = mergeBriefing(createEmptyBriefing(), { recipient: 'Ana', mainTheme: 'flores', creativeDirection: 'delicada' });
    const corrected = correctBriefingField(current, 'recipient', 'Maria');
    expect(corrected.recipient).toBe('Maria');
    expect(corrected.mainTheme).toBe('flores');
    expect(corrected.creativeDirection).toBe('delicada');
  });

  it('requires a reference when reference mode is selected', () => {
    const briefing = mergeBriefing(createEmptyBriefing('reference'), { mainTheme: 'pet', desiredStyle: 'minimalista' });
    const evaluation = getBriefingEvaluation(briefing);
    expect(evaluation.missingInformation).toContain('references');
    expect(evaluation.nextQuestion).toContain('imagem');
    expect(evaluation.readyToGenerate).toBe(false);
  });

  it('deduplicates normalized list facts', () => {
    const briefing = mergeBriefing(createEmptyBriefing(), { mandatoryText: ['Amor', ' Amor ', 'Sempre'] });
    expect(briefing.mandatoryText).toEqual(['Amor', 'Sempre']);
  });
});
