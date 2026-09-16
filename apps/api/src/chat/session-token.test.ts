import { describe, expect, it } from 'vitest';
import { createOpaqueSessionToken, hashSessionToken } from './session-token.js';

describe('chat session token', () => {
  it('creates URL-safe high-entropy opaque tokens', () => {
    const first = createOpaqueSessionToken();
    const second = createOpaqueSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it('creates a stable SHA-256 hash without leaking the raw token', () => {
    const token = 'example_session_token_for_hashing';
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashSessionToken(token));
    expect(hash).not.toContain(token);
  });
});
