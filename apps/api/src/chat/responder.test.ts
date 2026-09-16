import { describe, expect, it } from 'vitest';
import { FOUNDATION_RESPONSE, createFoundationResponse } from './responder.js';

describe('foundation chat responder', () => {
  it('streams the deterministic foundation response in ordered chunks', async () => {
    const chunks: string[] = [];
    for await (const chunk of createFoundationResponse()) chunks.push(chunk);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(FOUNDATION_RESPONSE);
    expect(FOUNDATION_RESPONSE).toBe(
      'Entendi. Pode continuar me contando como você imagina sua caneca.',
    );
  });
});
