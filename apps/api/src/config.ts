export interface ApiConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  chatOrigin: string;
  openaiApiKey: string;
  openaiConversationModel: string;
  nodeEnv: 'development' | 'test' | 'production';
  sessionCookieName: string;
  sessionTtlDays: number;
  port: number;
}

type ApiEnvironment = Record<string, string | undefined>;

function requireValue(env: ApiEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalValue(env: ApiEnvironment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) return 3000;

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parseNodeEnv(
  value: string | undefined,
): 'development' | 'test' | 'production' {
  const nodeEnv = value?.trim() || 'development';
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  return nodeEnv;
}

function parseSessionTtlDays(value: string | undefined): number {
  if (!value?.trim()) return 30;

  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('SESSION_TTL_DAYS must be an integer between 1 and 365');
  }
  return days;
}

export function loadApiConfig(env: ApiEnvironment): ApiConfig {
  return {
    supabaseUrl: requireValue(env, 'SUPABASE_URL'),
    supabaseSecretKey: requireValue(env, 'SUPABASE_SECRET_KEY'),
    chatOrigin: requireValue(env, 'CHAT_ORIGIN'),
    openaiApiKey: requireValue(env, 'OPENAI_API_KEY'),
    openaiConversationModel: requireValue(env, 'OPENAI_CONVERSATION_MODEL'),
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    sessionCookieName: optionalValue(env, 'SESSION_COOKIE_NAME') ?? 'cf_session',
    sessionTtlDays: parseSessionTtlDays(env.SESSION_TTL_DAYS),
    port: parsePort(env.PORT),
  };
}
