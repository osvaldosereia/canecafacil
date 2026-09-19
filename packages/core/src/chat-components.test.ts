import { describe, expect, it } from 'vitest';
import { validateChatComponentEnvelope } from './chat-components';

describe('validateChatComponentEnvelope', () => {
  it('accepts bounded versioned conversational components', () => {
    expect(validateChatComponentEnvelope({ version: 1, components: [
      { type: 'text', text: '  Me conta para quem é a caneca.  ' },
      { type: 'quick_replies', options: [{ id: 'presente', label: 'É presente' }] },
    ]})).toEqual({ version: 1, components: [
      { type: 'text', text: 'Me conta para quem é a caneca.' },
      { type: 'quick_replies', options: [{ id: 'presente', label: 'É presente' }] },
    ]});
  });

  it('rejects unknown versions and arbitrary component types', () => {
    expect(() => validateChatComponentEnvelope({ version: 2, components: [] })).toThrow('unsupported chat component protocol version');
    expect(() => validateChatComponentEnvelope({ version: 1, components: [{ type: 'html', html: '<script />' }] })).toThrow('unsupported chat component type');
  });

  it('bounds component and action counts', () => {
    expect(() => validateChatComponentEnvelope({ version: 1, components: Array.from({ length: 5 }, () => ({ type: 'text', text: 'x' })) })).toThrow('at most 4');
    expect(() => validateChatComponentEnvelope({ version: 1, components: [{ type: 'action_buttons', actions: Array.from({ length: 4 }, (_, i) => ({ id: String(i), label: 'A', action: 'noop' })) }] })).toThrow('1 to 3');
  });

  it('validates upload requests without exposing arbitrary payloads', () => {
    expect(validateChatComponentEnvelope({ version: 1, components: [{ type: 'upload_request', media: 'image_or_audio', prompt: 'Pode mandar sua referência.' }] }).components[0]).toEqual({ type: 'upload_request', media: 'image_or_audio', prompt: 'Pode mandar sua referência.' });
    expect(() => validateChatComponentEnvelope({ version: 1, components: [{ type: 'upload_request', media: 'video' }] })).toThrow('invalid upload media');
  });

  it('accepts only bounded server-priced storefront carousel items', () => {
    expect(validateChatComponentEnvelope({ version: 1, components: [{ type: 'storefront_carousel', items: [{ templateId: 'classic', name: 'Caneca Clássica', priceCents: 2990, capacityMl: 325 }] }] }).components[0]).toEqual({ type: 'storefront_carousel', items: [{ templateId: 'classic', name: 'Caneca Clássica', priceCents: 2990, capacityMl: 325 }] });
    expect(() => validateChatComponentEnvelope({ version: 1, components: [{ type: 'storefront_carousel', items: Array.from({ length: 9 }, (_, i) => ({ templateId: String(i), name: 'Caneca', priceCents: 2990 })) }] })).toThrow('1 to 8');
    expect(() => validateChatComponentEnvelope({ version: 1, components: [{ type: 'storefront_carousel', items: [{ templateId: 'x', name: 'X', priceCents: -1 }] }] })).toThrow('price cents');
  });
});
