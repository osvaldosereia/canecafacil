import { describe, expect, it, vi } from 'vitest';
import { createChatApi } from './chat-api.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chat browser API', () => {
  it('starts session and loads history with credentials', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ conversationId: 'c1' }, 201))
      .mockResolvedValueOnce(jsonResponse({ conversationId: 'c1', messages: [] }));
    const api = createChatApi({ apiUrl: 'http://localhost:3000', fetchImpl });

    await api.startSession();
    await api.loadConversation();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/chat/session',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/chat/conversation',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('sends a turn as SSE with an idempotency UUID', async () => {
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: text_delta\ndata: {"text":"Oi"}\n\n'),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const api = createChatApi({
      apiUrl: 'http://localhost:3000',
      fetchImpl,
      createMessageId: () => '7c4c0c87-b137-4df4-90d7-f31c88940864',
    });

    const events = [];
    for await (const event of api.sendTurn('Minha caneca')) events.push(event);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/v1/chat/turns',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          clientMessageId: '7c4c0c87-b137-4df4-90d7-f31c88940864',
          text: 'Minha caneca',
        }),
      }),
    );
    expect(events).toEqual([{ event: 'text_delta', data: { text: 'Oi' } }]);
  });

  it('uploads media with credentials and no public URL assumption', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ id: 'asset-1', mediaType: 'image' }, 201),
    );
    const api = createChatApi({ apiUrl: 'http://localhost:3000', fetchImpl });
    const file = new File(['image'], 'foto.png', { type: 'image/png' });

    const result = await api.uploadMedia(file);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/v1/chat/media',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(result).toEqual({ id: 'asset-1', mediaType: 'image' });
    expect(result).not.toHaveProperty('url');
  });
});
