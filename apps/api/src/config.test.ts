import { describe, expect, it } from 'vitest';
import { loadApiConfig } from './config';

const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

const whatsappEnv = {
  WHATSAPP_VERIFY_TOKEN: 'verify-test',
  WHATSAPP_ACCESS_TOKEN: 'access-test',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_GRAPH_VERSION: 'v99.0',
};

describe('loadApiConfig', () => {
  it('loads simulator-capable config without WhatsApp variables', () => {
    expect(
      loadApiConfig({
        ...baseEnv,
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toMatchObject({
      supabaseUrl: 'https://example.supabase.co',
      supabaseSecretKey: 'sb_secret_test',
      openaiApiKey: 'sk-test',
      openaiBriefingModel: 'gpt-5.6-luna',
      whatsappVerifyToken: undefined,
      whatsappAccessToken: undefined,
      whatsappPhoneNumberId: undefined,
      whatsappGraphVersion: undefined,
      port: 3000,
    });
  });

  it('loads WhatsApp capability when canonical variables are present', () => {
    expect(
      loadApiConfig({
        ...baseEnv,
        ...whatsappEnv,
        WHATSAPP_APP_SECRET: 'app-secret-test',
        OPENAI_BRIEFING_MODEL: 'briefing-model-test',
        ADMIN_ORIGIN: 'https://admin.example.com',
        PORT: '4100',
      }),
    ).toMatchObject({
      whatsappVerifyToken: 'verify-test',
      whatsappAccessToken: 'access-test',
      whatsappPhoneNumberId: '123456789',
      whatsappGraphVersion: 'v99.0',
      whatsappAppSecret: 'app-secret-test',
      openaiBriefingModel: 'briefing-model-test',
      adminOrigin: 'https://admin.example.com',
      port: 4100,
    });
  });

  it('keeps Supabase server credentials required', () => {
    expect(() =>
      loadApiConfig({
        ...baseEnv,
        SUPABASE_SECRET_KEY: '',
      }),
    ).toThrow('SUPABASE_SECRET_KEY');
  });

  it('does not silently use legacy META variables', () => {
    expect(
      loadApiConfig({
        ...baseEnv,
        META_VERIFY_TOKEN: 'legacy-token',
      }),
    ).toMatchObject({
      whatsappVerifyToken: undefined,
    });
  });

  it('allows partial WhatsApp configuration without blocking server startup', () => {
    expect(
      loadApiConfig({
        ...baseEnv,
        WHATSAPP_ACCESS_TOKEN: 'access-test',
      }),
    ).toMatchObject({
      whatsappAccessToken: 'access-test',
      whatsappVerifyToken: undefined,
      whatsappGraphVersion: undefined,
    });
  });
});
