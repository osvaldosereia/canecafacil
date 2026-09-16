export interface CustomerChatTurnInput {
  clientMessageId: string;
  text: string;
}

export interface CustomerChatTurn {
  clientMessageId: string;
  text: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCustomerChatTurn(
  input: CustomerChatTurnInput,
): CustomerChatTurn {
  if (!UUID_PATTERN.test(input.clientMessageId)) {
    throw new Error('clientMessageId must be a UUID');
  }

  const text = input.text.trim();
  if (!text) {
    throw new Error('Chat message text is required');
  }
  if (text.length > 8000) {
    throw new Error('Chat message text must be at most 8000 characters');
  }

  return {
    clientMessageId: input.clientMessageId,
    text,
  };
}
