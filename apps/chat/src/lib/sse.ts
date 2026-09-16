export interface ChatSseEvent {
  event: string;
  data: unknown;
}

function parseBlock(block: string): ChatSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    if (rawLine.startsWith('event:')) {
      event = rawLine.slice('event:'.length).trim();
      continue;
    }
    if (rawLine.startsWith('data:')) {
      dataLines.push(rawLine.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  const serialized = dataLines.join('\n');
  let data: unknown = serialized;
  try {
    data = JSON.parse(serialized);
  } catch {
    // Plain text SSE data is still valid and remains a string.
  }
  return { event, data };
}

export async function* parseSseResponse(
  response: Response,
): AsyncGenerator<ChatSseEvent> {
  if (!response.ok) {
    throw new Error(`Chat stream failed with status ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Chat stream did not include a response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
        boundary = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const finalBlock = buffer.trim();
    if (finalBlock) {
      const parsed = parseBlock(finalBlock);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}
