import { Hono } from 'hono';
import { registerChatSessionRoutes } from './chat/session-routes.js';
import type { ChatSessionStore } from './chat/session-store.js';
import { createSupabaseChatSessionStore } from './chat/supabase-session-store.js';
import type { ApiConfig } from './config.js';
import { createServerSupabaseClient } from './lib/supabase.js';

export type ApiAppConfig = Partial<ApiConfig>;

export interface ApiAppDependencies {
  sessionStore?: ChatSessionStore;
}

function resolveSessionStore(
  config: ApiAppConfig,
  dependencies: ApiAppDependencies,
): ChatSessionStore | undefined {
  if (dependencies.sessionStore) return dependencies.sessionStore;
  if (!config.supabaseUrl?.trim() || !config.supabaseSecretKey?.trim()) {
    return undefined;
  }

  return createSupabaseChatSessionStore(
    createServerSupabaseClient({
      url: config.supabaseUrl,
      secretKey: config.supabaseSecretKey,
    }),
  );
}

export function createApiApp(
  config: ApiAppConfig = {},
  dependencies: ApiAppDependencies = {},
) {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      service: 'caneca-facil-api',
    }),
  );

  const sessionStore = resolveSessionStore(config, dependencies);
  if (
    sessionStore &&
    config.chatOrigin?.trim() &&
    config.nodeEnv &&
    config.sessionCookieName?.trim() &&
    config.sessionTtlDays
  ) {
    registerChatSessionRoutes(app, {
      store: sessionStore,
      chatOrigin: config.chatOrigin,
      nodeEnv: config.nodeEnv,
      sessionCookieName: config.sessionCookieName,
      sessionTtlDays: config.sessionTtlDays,
    });
  }

  return app;
}
