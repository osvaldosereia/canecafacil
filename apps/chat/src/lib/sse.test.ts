import { describe, expect, it } from 'vitest';
import { parseSseResponse } from './sse.js';

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('SSE parser', () => {
  it('parses events split across chunks and multiple events in one chunk', async () => {
    const response = responseFromChunks([
      'event: accepted\ndata: {"messageId":"m1"}\n\nevent: text_',
      'delta\ndata: {"text":"Olá 👋"}\n\nevent: done\ndata: {"assistantMessageId":"a1"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSseResponse(response)) events.push(event);

    expect(events).toEqual([
      { event: 'accepted', data: { messageId: 'm1' } },
      { event: 'text_delta', data: { text: 'Olá 👋' } },
      { event: 'done', data: { assistantMessageId: 'a1' } },
    ]);
  });

  it('throws when the response is not successful', async () => {
    const response = new Response('nope', { status: 401 });
    const collect = async () => {
      for await (const _event of parseSseResponse(response)) void _event;
    };
    await expect(collect()).rejects.toThrow('Chat stream failed with status 401');
  });
});
