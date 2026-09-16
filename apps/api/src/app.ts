import { Hono } from 'hono';
import type { ApiConfig } from './config.js';

export type ApiAppConfig = Partial<ApiConfig>;

export function createApiApp(_config: ApiAppConfig = {}) {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      service: 'caneca-facil-api',
    }),
  );

  return app;
}
