import OpenAI from 'openai';
import type { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getStudioJobSnapshot,
  startStudioJob,
  type StudioJobInput,
  type StudioReference,
} from './service.js';

interface StudioRouteConfig {
  client: SupabaseClient;
  adminOrigin: string;
  openAiApiKey?: string;
  imageModel: string;
}

class InvalidStudioInput extends Error {}

function readText(
  form: FormData,
  name: string,
  maxLength: number,
  required = false,
): string | null {
  const entry = form.get(name);
  if (entry === null) {
    if (required) throw new InvalidStudioInput();
    return null;
  }
  if (typeof entry !== 'string') throw new InvalidStudioInput();
  const value = entry.trim();
  if (value.length > maxLength || (required && !value)) {
    throw new InvalidStudioInput();
  }
  return value || null;
}

function readList(form: FormData, name: string, maxItems = 12): string[] {
  const value = readText(form, name, 3000) ?? '';
  const items = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > maxItems || items.some((item) => item.length > 200)) {
    throw new InvalidStudioInput();
  }
  return items;
}

function isFileEntry(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value !== 'string' &&
      typeof value.arrayBuffer === 'function' &&
      typeof value.name === 'string',
  );
}

async function parseStudioInput(form: FormData): Promise<StudioJobInput> {
  const mode = readText(form, 'creationMode', 20, true);
  const mainTheme = readText(form, 'mainTheme', 500, true);
  if (!mainTheme || (mode !== 'reference' && mode !== 'from_scratch')) {
    throw new InvalidStudioInput();
  }
  const title = readText(form, 'title', 100) ?? ('Caneca - ' + mainTheme.slice(0, 80));

  const fileEntry = form.get('reference');
  let reference: StudioReference | null = null;
  if (fileEntry !== null && fileEntry !== '') {
    if (!isFileEntry(fileEntry)) throw new InvalidStudioInput();
    if (
      fileEntry.size <= 0 ||
      fileEntry.size > 8 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(fileEntry.type)
    ) {
      throw new InvalidStudioInput();
    }
    reference = {
      bytes: new Uint8Array(await fileEntry.arrayBuffer()),
      fileName: fileEntry.name || 'reference-image',
      mimeType: fileEntry.type,
    };
  }

  if (mode === 'reference' && !reference) throw new InvalidStudioInput();
  if (mode === 'from_scratch' && reference) throw new InvalidStudioInput();

  return {
    title,
    creationMode: mode,
    occasion: readText(form, 'occasion', 120),
    recipient: readText(form, 'recipient', 120),
    mainTheme,
    desiredStyle: readText(form, 'desiredStyle', 200),
    colorPreferences: readList(form, 'colorPreferences'),
    mandatoryText: readList(form, 'mandatoryText'),
    mandatoryElements: readList(form, 'mandatoryElements'),
    forbiddenElements: readList(form, 'forbiddenElements'),
    compositionNotes: readText(form, 'compositionNotes', 1000),
    reference,
  };
}

async function authorizeAdmin(
  client: SupabaseClient,
  authorization: string | undefined,
): Promise<{ ok: true } | { ok: false; status: 401 | 403 | 503 }> {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401 };

  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return { ok: false, status: 401 };

  const membership = await client
    .from('admin_membership_lookup')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (membership.error) return { ok: false, status: 503 };
  if (!membership.data) return { ok: false, status: 403 };
  return { ok: true };
}

function authorizationError(status: 401 | 403 | 503) {
  if (status === 401) return { error: 'admin_auth_required' };
  if (status === 403) return { error: 'admin_access_required' };
  return { error: 'admin_access_unavailable' };
}

export function registerStudioRoutes(app: Hono, config: StudioRouteConfig): void {
  const openai = config.openAiApiKey
    ? new OpenAI({ apiKey: config.openAiApiKey })
    : null;

  app.post('/v1/admin/studio/jobs', async (context) => {
    if (context.req.header('Origin') !== config.adminOrigin) {
      return context.json({ error: 'origin_not_allowed' }, 403);
    }

    const access = await authorizeAdmin(
      config.client,
      context.req.header('Authorization'),
    );
    if (!access.ok) {
      return context.json(authorizationError(access.status), access.status);
    }
    if (!openai) return context.json({ error: 'studio_not_configured' }, 503);

    let input: StudioJobInput;
    try {
      input = await parseStudioInput(await context.req.formData());
    } catch {
      return context.json({ error: 'invalid_studio_input' }, 400);
    }

    try {
      const job = await startStudioJob(
        config.client,
        openai,
        input,
        config.imageModel,
      );
      return context.json(job, 202);
    } catch (error) {
      console.error('[caneca-studio] could not start job', error);
      return context.json({ error: 'studio_job_start_failed' }, 500);
    }
  });

  app.get('/v1/admin/studio/jobs/:projectId', async (context) => {
    if (context.req.header('Origin') !== config.adminOrigin) {
      return context.json({ error: 'origin_not_allowed' }, 403);
    }

    const access = await authorizeAdmin(
      config.client,
      context.req.header('Authorization'),
    );
    if (!access.ok) {
      return context.json(authorizationError(access.status), access.status);
    }

    const projectId = context.req.param('projectId');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    ) {
      return context.json({ error: 'studio_job_not_found' }, 404);
    }

    try {
      const job = await getStudioJobSnapshot(config.client, projectId);
      if (!job) return context.json({ error: 'studio_job_not_found' }, 404);
      return context.json(job, 200);
    } catch (error) {
      console.error('[caneca-studio] could not read job', error);
      return context.json({ error: 'studio_job_lookup_failed' }, 500);
    }
  });
}
