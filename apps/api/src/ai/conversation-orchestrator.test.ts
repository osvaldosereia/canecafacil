import { describe, expect, it, vi } from 'vitest';
import { createEmptyBriefing } from '@caneca-facil/core';
import { createConversationOrchestrator } from './conversation-orchestrator.js';
import { createDeterministicConversationInterpreter } from './conversation-interpreter.js';
import type { ConversationBriefingStore } from './briefing-store.js';

function store(mode: 'ai' | 'human' | 'paused' = 'ai'): ConversationBriefingStore {
  return {
    load: vi.fn(async () => ({
      conversationId: 'conversation-1', automationMode: mode, projectId: 'project-1',
      briefingId: null, briefing: createEmptyBriefing(),
    })),
    saveVersion: vi.fn(async () => ({ briefingId: 'briefing-1', version: 1 })),
  };
}

describe('conversation orchestrator', () => {
  it('applies interpreter facts only through deterministic briefing evaluation', async () => {
    const briefingStore = store();
    const orchestrator = createConversationOrchestrator({
      briefingStore,
      interpreter: createDeterministicConversationInterpreter(() => ({
        replyText: 'Perfeito.', facts: { mainTheme: 'flores', creativeDirection: 'aquarela' },
      })),
    });
    const result = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'Quero flores em aquarela' });
    expect(result.briefing.mainTheme).toBe('flores');
    expect(result.briefing.readyToGenerate).toBe(true);
    expect(briefingStore.saveVersion).toHaveBeenCalledOnce();
  });

  it.each(['human', 'paused'] as const)('never invokes AI while automation mode is %s', async (mode) => {
    const briefingStore = store(mode);
    const interpreter = { interpret: vi.fn() };
    const orchestrator = createConversationOrchestrator({ briefingStore, interpreter });
    const result = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'oi' });
    expect(result.mode).toBe(mode);
    expect(result.replyText).toBeNull();
    expect(interpreter.interpret).not.toHaveBeenCalled();
    expect(briefingStore.saveVersion).not.toHaveBeenCalled();
  });

  it('uses deterministic missing information to append the minimum next question', async () => {
    const orchestrator = createConversationOrchestrator({
      briefingStore: store(),
      interpreter: createDeterministicConversationInterpreter(() => ({ replyText: 'Entendi.', facts: {} })),
    });
    const result = await orchestrator.handle({ conversationId: 'conversation-1', customerText: 'oi' });
    expect(result.replyText).toContain('Qual é a ideia principal');
    expect(result.briefing.readyToGenerate).toBe(false);
  });
});
