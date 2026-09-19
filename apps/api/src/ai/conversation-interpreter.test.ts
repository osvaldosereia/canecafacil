import { describe, expect, it } from 'vitest';
import { createDeterministicConversationInterpreter, validateConversationInterpretation } from './conversation-interpreter.js';

describe('conversation interpreter', () => {
  it('keeps extraction separate from protected business mutations', async () => {
    const interpreter = createDeterministicConversationInterpreter(() => ({
      replyText: 'Perfeito. Vou usar azul e o nome Ana.',
      facts: { colorPreferences: ['azul'], names: ['Ana'] },
      components: { version: 1, components: [{ type: 'quick_replies', options: [{ id: 'livre', label: 'Pode criar livremente' }] }] },
    }));
    const result = await interpreter.interpret({ customerText: 'azul, nome Ana', knownBriefing: {} });
    expect(result.facts).toEqual({ colorPreferences: ['azul'], names: ['Ana'] });
    expect(result.components?.version).toBe(1);
  });

  it('rejects arbitrary UI from a provider', () => {
    expect(() => validateConversationInterpretation({ replyText: 'x', facts: {}, components: { version: 1, components: [{ type: 'html', html: '<script />' }] } })).toThrow();
  });

  it('rejects empty provider replies', () => {
    expect(() => validateConversationInterpretation({ replyText: '   ', facts: {} })).toThrow();
  });
});
