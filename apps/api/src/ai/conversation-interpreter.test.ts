import { describe, expect, it, vi } from 'vitest';
import {
  createDeterministicConversationInterpreter,
  createOpenAIConversationInterpreter,
  validateConversationInterpretation,
} from './conversation-interpreter.js';

describe('conversation interpreter', () => {
  it('keeps extraction separate from protected business mutations', async () => {
    const interpreter = createDeterministicConversationInterpreter(() => ({
      replyText: 'Perfeito. Vou usar azul e o nome Ana.',
      facts: { colorPreferences: ['azul'], names: ['Ana'] },
      components: {
        version: 1,
        components: [
          {
            type: 'quick_replies',
            options: [{ id: 'livre', label: 'Pode criar livremente' }],
          },
        ],
      },
    }));
    const result = await interpreter.interpret({
      customerText: 'azul, nome Ana',
      knownBriefing: {},
    });
    expect(result.facts).toEqual({
      colorPreferences: ['azul'],
      names: ['Ana'],
    });
    expect(result.components?.version).toBe(1);
  });

  it('rejects protected or unknown facts from a provider', () => {
    expect(() =>
      validateConversationInterpretation({
        replyText: 'pronto',
        facts: { readyToGenerate: true },
      }),
    ).toThrow('unsupported briefing fact');
  });

  it('rejects arbitrary UI from a provider', () => {
    expect(() =>
      validateConversationInterpretation({
        replyText: 'x',
        facts: {},
        components: {
          version: 1,
          components: [{ type: 'html', html: '<script />' }],
        },
      }),
    ).toThrow();
  });

  it('rejects empty provider replies', () => {
    expect(() =>
      validateConversationInterpretation({ replyText: '   ', facts: {} }),
    ).toThrow();
  });

  it('uses structured OpenAI output with compact recent context and allows validated components', async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        replyText: 'Perfeito, vou considerar azul.',
        facts: { colorPreferences: ['azul'] },
        components: {
          version: 1,
          components: [
            {
              type: 'quick_replies',
              options: [{ id: 'continuar', label: 'Continuar' }],
            },
          ],
        },
      }),
    });
    const client = { responses: { create } } as any;
    const interpreter = createOpenAIConversationInterpreter({
      apiKey: 'test-key',
      client,
      maxRecentMessages: 2,
    });
    const result = await interpreter.interpret({
      customerText: 'quero azul',
      knownBriefing: { occasion: 'presente' },
      recentMessages: [
        { senderType: 'customer', text: 'antiga' },
        { senderType: 'ai', text: 'qual cor?' },
        { senderType: 'customer', text: 'azul' },
      ],
    });

    expect(result.facts).toEqual({ colorPreferences: ['azul'] });
    expect(result.components?.components[0]?.type).toBe('quick_replies');
    const request = create.mock.calls[0][0];
    expect(request.model).toBe('gpt-5.6-luna');
    expect(request.text.format.type).toBe('json_schema');
    expect(request.text.format.strict).toBe(false);
    expect(request.input).not.toContain('antiga');
    expect(request.input).toContain('qual cor?');
  });

  it('fails closed when OpenAI returns invalid JSON', async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ output_text: 'not-json' }) },
    } as any;
    const interpreter = createOpenAIConversationInterpreter({
      apiKey: 'test-key',
      client,
    });
    await expect(
      interpreter.interpret({ customerText: 'oi', knownBriefing: {} }),
    ).rejects.toThrow('invalid JSON');
  });
});
