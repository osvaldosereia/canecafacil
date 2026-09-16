import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';

describe('healthcheck', () => {
  it('retorna ok', async () => {
    const response = await createApiApp().request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'caneca-facil-api',
    });
  });
});

describe('API configuration', () => {
  it('does not register a Meta webhook', async () => {
    const response = await createApiApp({}).request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=legacy&hub.challenge=42',
    );

    expect(response.status).toBe(404);
  });
});
