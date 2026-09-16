import { describe, expect, it } from 'vitest';
import { loadApiConfig } from './config';

const ownChatEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  CHAT_ORIGIN: 'http://localhost:5174',
  OPENAI_API_KEY: 'sk-test-placeholder',
  OPENAI_CONVERSATION_MODEL: 'gpt-5.6-luna',
};

describe('loadApiConfig', () => {
  it('loads the own-chat runtime without Meta variables', () => {
    expect(loadApiConfig(ownChatEnv)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseSecretKey: 'sb_secret_test',
      chatOrigin: 'http://localhost:5174',
      openaiApiKey: 'sk-test-placeholder',
      openaiConversationModel: 'gpt-5.6-luna',
      nodeEnv: 'development',
      sessionCookieName: 'cf_session',
      sessionTtlDays: 30,
      port: 3000,
    });
  });

  it('loads explicit own-chat runtime overrides', () => {
    expect(
      loadApiConfig({
        ...ownChatEnv,
        NODE_ENV: 'production',
        SESSION_COOKIE_NAME: 'custom_session',
        SESSION_TTL_DAYS: '14',
        PORT: '4100',
      }),
    ).toMatchObject({
      nodeEnv: 'production',
      sessionCookieName: 'custom_session',
      sessionTtlDays: 14,
      port: 4100,
    });
  });

  it('fails fast when a required server variable is missing', () => {
    expect(() =>
      loadApiConfig({
        ...ownChatEnv,
        SUPABASE_SECRET_KEY: '',
      }),
    ).toThrow('SUPABASE_SECRET_KEY');
  });

  it('requires the backend-only OpenAI key and conversation model', () => {
    expect(() =>
      loadApiConfig({
        ...ownChatEnv,
        OPENAI_API_KEY: '',
      }),
    ).toThrow('OPENAI_API_KEY');

    expect(() =>
      loadApiConfig({
        ...ownChatEnv,
        OPENAI_CONVERSATION_MODEL: '',
      }),
    ).toThrow('OPENAI_CONVERSATION_MODEL');
  });

  it('rejects an invalid session TTL', () => {
    expect(() =>
      loadApiConfig({
        ...ownChatEnv,
        SESSION_TTL_DAYS: '0',
      }),
    ).toThrow('SESSION_TTL_DAYS must be an integer between 1 and 365');
  });

  it('rejects an unsupported NODE_ENV', () => {
    expect(() =>
      loadApiConfig({
        ...ownChatEnv,
        NODE_ENV: 'staging',
      }),
    ).toThrow('NODE_ENV must be development, test, or production');
  });
});
