export const CHAT_COMPONENT_PROTOCOL_VERSION = 1 as const;

export type ChatComponent =
  | { type: 'text'; text: string }
  | { type: 'quick_replies'; options: Array<{ id: string; label: string }> }
  | { type: 'action_buttons'; actions: Array<{ id: string; label: string; action: string }> }
  | { type: 'upload_request'; media: 'image' | 'audio' | 'image_or_audio'; prompt?: string }
  | { type: 'notice'; text: string; tone?: 'info' | 'success' | 'warning' };

export interface ChatComponentEnvelope {
  version: typeof CHAT_COMPONENT_PROTOCOL_VERSION;
  components: ChatComponent[];
}

function text(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} is too long`);
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('component must be an object');
  return value as Record<string, unknown>;
}

export function validateChatComponentEnvelope(value: unknown): ChatComponentEnvelope {
  const envelope = record(value);
  if (envelope.version !== CHAT_COMPONENT_PROTOCOL_VERSION) throw new Error('unsupported chat component protocol version');
  if (!Array.isArray(envelope.components) || envelope.components.length > 4) throw new Error('components must contain at most 4 items');

  const components = envelope.components.map((raw): ChatComponent => {
    const item = record(raw);
    switch (item.type) {
      case 'text':
        return { type: 'text', text: text(item.text, 'text', 2000) };
      case 'notice': {
        const tone = item.tone;
        if (tone !== undefined && !['info', 'success', 'warning'].includes(String(tone))) throw new Error('invalid notice tone');
        return { type: 'notice', text: text(item.text, 'text', 1000), ...(tone ? { tone: tone as 'info' | 'success' | 'warning' } : {}) };
      }
      case 'upload_request': {
        if (!['image', 'audio', 'image_or_audio'].includes(String(item.media))) throw new Error('invalid upload media');
        return { type: 'upload_request', media: item.media as 'image' | 'audio' | 'image_or_audio', ...(item.prompt === undefined ? {} : { prompt: text(item.prompt, 'prompt', 500) }) };
      }
      case 'quick_replies': {
        if (!Array.isArray(item.options) || item.options.length < 1 || item.options.length > 5) throw new Error('quick replies require 1 to 5 options');
        return { type: 'quick_replies', options: item.options.map((option) => { const o = record(option); return { id: text(o.id, 'option id', 80), label: text(o.label, 'option label', 120) }; }) };
      }
      case 'action_buttons': {
        if (!Array.isArray(item.actions) || item.actions.length < 1 || item.actions.length > 3) throw new Error('action buttons require 1 to 3 actions');
        return { type: 'action_buttons', actions: item.actions.map((action) => { const a = record(action); return { id: text(a.id, 'action id', 80), label: text(a.label, 'action label', 120), action: text(a.action, 'action', 120) }; }) };
      }
      default:
        throw new Error('unsupported chat component type');
    }
  });
  return { version: CHAT_COMPONENT_PROTOCOL_VERSION, components };
}
