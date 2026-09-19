import { describe, expect, it } from 'vitest';
import { createEmptyBriefing, type Briefing } from '@caneca-facil/core';
import type { ConversationBriefingContext, ConversationBriefingStore } from './briefing-store.js';
import { createDeterministicConversationInterpreter } from './conversation-interpreter.js';
import { createConversationOrchestrator } from './conversation-orchestrator.js';

function createMemoryStore(): ConversationBriefingStore & { current(): ConversationBriefingContext } {
  let context: ConversationBriefingContext = {
    conversationId: 'conversation-1',
    automationMode: 'ai',
    projectId: 'project-1',
    briefingId: null,
    briefing: createEmptyBriefing(),
  };
  let version = 0;
  return {
    current: () => context,
    async load() { return context; },
    async saveVersion(input) {
      version += 1;
      const briefingId = `briefing-${version}`;
      context = { ...context, briefingId, briefing: input.briefing };
      return { briefingId, version };
    },
  };
}

describe('Phase B acceptance — same conversational engine', () => {
  it('builds a briefing across turns and preserves unrelated facts on correction', async () => {
    const store = createMemoryStore();
    const interpreter = createDeterministicConversationInterpreter(({ customerText }) => {
      if (customerText === 'Quero uma caneca de aniversário para Ana') {
        return { replyText: 'Ótimo, já comecei seu projeto.', facts: { occasion: 'aniversário', recipient: 'Ana', names: ['Ana'], mainTheme: 'flores' } };
      }
      if (customerText === 'Quero delicada e rosa') {
        return { replyText: 'Perfeito.', facts: { desiredStyle: 'delicado', colorPreferences: ['rosa'] } };
      }
      return { replyText: 'Atualizei a cor.', facts: { colorPreferences: ['lilás'] } };
    });
    const orchestrator = createConversationOrchestrator({ interpreter, briefingStore: store });

    const first = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'Quero uma caneca de aniversário para Ana' });
    expect(first.briefing.recipient).toBe('Ana');
    expect(first.briefing.readyToGenerate).toBe(false);

    const second = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'Quero delicada e rosa' });
    expect(second.briefing.readyToGenerate).toBe(true);
    expect(second.briefing.colorPreferences).toEqual(['rosa']);

    const corrected = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'Na verdade, lilás' });
    expect(corrected.briefing.colorPreferences).toEqual(['lilás']);
    expect(corrected.briefing.recipient).toBe('Ana');
    expect(corrected.briefing.occasion).toBe('aniversário');
    expect(corrected.briefing.mainTheme).toBe('flores');
    expect(corrected.briefing.desiredStyle).toBe('delicado');
    expect(corrected.briefing.readyToGenerate).toBe(true);
    expect(store.current().briefingId).toBe('briefing-3');
  });

  it('never lets interpreter-supplied unknown protected facts enter the briefing', async () => {
    const store = createMemoryStore();
    const interpreter = createDeterministicConversationInterpreter(() => ({
      replyText: 'Tudo certo.',
      facts: { mainTheme: 'gatos', desiredStyle: 'minimalista' } as Partial<Briefing>,
    }));
    const orchestrator = createConversationOrchestrator({ interpreter, briefingStore: store });
    const result = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'Faça de gatos' });
    expect(result.briefing.readyToGenerate).toBe(true);
    expect(result.briefing.mainTheme).toBe('gatos');
  });
});
