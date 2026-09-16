import { describe, expect, it } from 'vitest';
import { normalizeCustomerChatTurn } from './chat';

describe('normalizeCustomerChatTurn', () => {
  it('trims only outer whitespace and preserves the message body', () => {
    expect(
      normalizeCustomerChatTurn({
        clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
        text: '  Quero uma caneca\ncom flores  ',
      }),
    ).toEqual({
      clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
      text: 'Quero uma caneca\ncom flores',
    });
  });

  it('rejects blank customer text', () => {
    expect(() =>
      normalizeCustomerChatTurn({
        clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
        text: '   \n  ',
      }),
    ).toThrow('Chat message text is required');
  });

  it('accepts 8000 UTF-16 code units and rejects 8001', () => {
    const id = '7c4c0c87-b137-4df4-90d7-f31c88940864';
    expect(normalizeCustomerChatTurn({ clientMessageId: id, text: 'a'.repeat(8000) }).text)
      .toHaveLength(8000);
    expect(() =>
      normalizeCustomerChatTurn({ clientMessageId: id, text: 'a'.repeat(8001) }),
    ).toThrow('Chat message text must be at most 8000 characters');
  });

  it('requires a UUID-shaped clientMessageId', () => {
    expect(() =>
      normalizeCustomerChatTurn({
        clientMessageId: 'retry-1',
        text: 'Olá',
      }),
    ).toThrow('clientMessageId must be a UUID');
  });
});
