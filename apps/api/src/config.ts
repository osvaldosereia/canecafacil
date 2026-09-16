export interface ApiConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  openaiApiKey?: string;
  openaiBriefingModel: string;
  adminOrigin?: string;
  whatsappVerifyToken?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappGraphVersion?: string;
  whatsappAppSecret?: string;
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

export function loadApiConfig(env: ApiEnvironment): ApiConfig {
  return {
    supabaseUrl: requireValue(env, 'SUPABASE_URL'),
    supabaseSecretKey: requireValue(env, 'SUPABASE_SECRET_KEY'),
    openaiApiKey: optionalValue(env, 'OPENAI_API_KEY'),
    openaiBriefingModel:
      optionalValue(env, 'OPENAI_BRIEFING_MODEL') ?? 'gpt-5.6-luna',
    adminOrigin: optionalValue(env, 'ADMIN_ORIGIN'),
    whatsappVerifyToken: optionalValue(env, 'WHATSAPP_VERIFY_TOKEN'),
    whatsappAccessToken: optionalValue(env, 'WHATSAPP_ACCESS_TOKEN'),
    whatsappPhoneNumberId: optionalValue(env, 'WHATSAPP_PHONE_NUMBER_ID'),
    whatsappGraphVersion: optionalValue(env, 'WHATSAPP_GRAPH_VERSION'),
    whatsappAppSecret: optionalValue(env, 'WHATSAPP_APP_SECRET'),
    port: parsePort(env.PORT),
  };
}
