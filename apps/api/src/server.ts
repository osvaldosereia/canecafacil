import { serve } from '@hono/node-server';
import { createApiApp } from './app.js';
import { loadApiConfig } from './config.js';

const config = loadApiConfig(process.env);

serve({
  fetch: createApiApp(config).fetch,
  port: config.port,
});
