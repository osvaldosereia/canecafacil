import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ChatMessageStore } from './chat/message-store.js';
import { registerChatSessionRoutes } from './chat/session-routes.js';
import type { ChatSessionStore } from './chat/session-store.js';
import { createSupabaseChatMessageStore } from './chat/supabase-message-store.js';
import { createSupabaseChatSessionStore } from './chat/supabase-session-store.js';
import { registerChatTurnRoutes } from './chat/turn-routes.js';
import type { ApiConfig } from './config.js';
import { createServerSupabaseClient } from './lib/supabase.js';
import type { ChatMediaStore } from './media/media-store.js';
import { createSupabaseChatMediaStore } from './media/supabase-media-store.js';
import { registerChatUploadRoutes } from './media/upload-routes.js';

export type ApiAppConfig = Partial<ApiConfig>;

export interface ApiAppDependencies {
  sessionStore?: ChatSessionStore;
  messageStore?: ChatMessageStore;
  mediaStore?: ChatMediaStore;
}

function canCreateSupabaseStore(config: ApiAppConfig): boolean {
  return Boolean(config.supabaseUrl?.trim() && config.supabaseSecretKey?.trim());
}

function createSupabaseClient(config: ApiAppConfig) {
  return createServerSupabaseClient({
    url: config.supabaseUrl!,
    secretKey: config.supabaseSecretKey!,
  });
}

function resolveSessionStore(
  config: ApiAppConfig,
  dependencies: ApiAppDependencies,
): ChatSessionStore | undefined {
  if (dependencies.sessionStore) return dependencies.sessionStore;
  if (!canCreateSupabaseStore(config)) return undefined;
  return createSupabaseChatSessionStore(createSupabaseClient(config));
}

function resolveMessageStore(
  config: ApiAppConfig,
  dependencies: ApiAppDependencies,
): ChatMessageStore | undefined {
  if (dependencies.messageStore) return dependencies.messageStore;
  if (!canCreateSupabaseStore(config)) return undefined;
  return createSupabaseChatMessageStore(createSupabaseClient(config));
}

function resolveMediaStore(
  config: ApiAppConfig,
  dependencies: ApiAppDependencies,
): ChatMediaStore | undefined {
  if (dependencies.mediaStore) return dependencies.mediaStore;
  if (!canCreateSupabaseStore(config)) return undefined;
  return createSupabaseChatMediaStore(createSupabaseClient(config));
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

  if (config.chatOrigin?.trim()) {
    app.use(
      '/v1/chat/*',
      cors({
        origin: config.chatOrigin,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        credentials: true,
      }),
    );
  }

  const sessionStore = resolveSessionStore(config, dependencies);
  const messageStore = resolveMessageStore(config, dependencies);
  const mediaStore = resolveMediaStore(config, dependencies);

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

    if (messageStore) {
      registerChatTurnRoutes(app, {
        sessionStore,
        messageStore,
        chatOrigin: config.chatOrigin,
        sessionCookieName: config.sessionCookieName,
      });
    }

    if (mediaStore) {
      registerChatUploadRoutes(app, {
        sessionStore,
        mediaStore,
        chatOrigin: config.chatOrigin,
        sessionCookieName: config.sessionCookieName,
      });
    }
  }

  return app;
}
