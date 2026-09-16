import OpenAI from 'openai';

export interface TranscriptionProviderInput {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface ProviderTranscript {
  text: string;
  language: string | null;
  model: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionProviderInput): Promise<ProviderTranscript>;
}

export interface StoredAudioTranscript {
  id: string;
  projectMediaId: string;
  text: string;
  language: string | null;
  model: string | null;
}

export interface AudioTranscriptionStore {
  findByProjectMediaId(
    projectMediaId: string,
  ): Promise<StoredAudioTranscript | null>;
  create(input: {
    projectMediaId: string;
    text: string;
    language: string | null;
    model: string;
  }): Promise<StoredAudioTranscript>;
}

export interface TranscribeAudioInput extends TranscriptionProviderInput {
  projectMediaId: string;
}

export interface AudioTranscript extends StoredAudioTranscript {
  reused: boolean;
}

export async function transcribeAudio(
  input: TranscribeAudioInput,
  dependencies: {
    provider: TranscriptionProvider;
    store: AudioTranscriptionStore;
  },
): Promise<AudioTranscript> {
  const existing = await dependencies.store.findByProjectMediaId(
    input.projectMediaId,
  );

  if (existing) {
    return { ...existing, reused: true };
  }

  const transcript = await dependencies.provider.transcribe({
    bytes: input.bytes,
    filename: input.filename,
    mimeType: input.mimeType,
  });

  const text = transcript.text.trim();
  if (!text) throw new Error('Audio transcription returned empty text');

  const stored = await dependencies.store.create({
    projectMediaId: input.projectMediaId,
    text,
    language: transcript.language,
    model: transcript.model,
  });

  return { ...stored, reused: false };
}

export interface OpenAITranscriptionProviderConfig {
  apiKey: string;
  model?: string;
  client?: OpenAI;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createOpenAITranscriptionProvider(
  config: OpenAITranscriptionProviderConfig,
): TranscriptionProvider {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error('Invalid OpenAI transcription configuration');

  const model = config.model?.trim() || 'gpt-4o-mini-transcribe';
  const client = config.client ?? new OpenAI({ apiKey });

  return {
    async transcribe(input) {
      const file = new File([toArrayBuffer(input.bytes)], input.filename, {
        type: input.mimeType,
      });
      const result = await client.audio.transcriptions.create({
        file,
        model,
      });

      if (!('text' in result) || typeof result.text !== 'string') {
        throw new Error('OpenAI transcription response was invalid');
      }

      return {
        text: result.text,
        language: null,
        model,
      };
    },
  };
}

interface SupabaseMaybeSingleResult {
  data: Record<string, unknown> | null;
  error: { message?: string; code?: string } | null;
}

export interface AudioTranscriptionSupabaseClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<SupabaseMaybeSingleResult>;
      };
    };
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<SupabaseMaybeSingleResult>;
      };
    };
  };
}

function mapStoredTranscript(
  row: Record<string, unknown> | null,
): StoredAudioTranscript | null {
  if (!row) return null;

  if (
    typeof row.id !== 'string' ||
    typeof row.project_media_id !== 'string' ||
    typeof row.transcription !== 'string'
  ) {
    throw new Error('Audio transcription database row was invalid');
  }

  return {
    id: row.id,
    projectMediaId: row.project_media_id,
    text: row.transcription,
    language: typeof row.language === 'string' ? row.language : null,
    model: typeof row.model === 'string' ? row.model : null,
  };
}

export function createSupabaseAudioTranscriptionStore(
  client: AudioTranscriptionSupabaseClient,
): AudioTranscriptionStore {
  const findByProjectMediaId = async (
    projectMediaId: string,
  ): Promise<StoredAudioTranscript | null> => {
    const { data, error } = await client
      .from('audio_transcriptions')
      .select('id, project_media_id, transcription, language, model')
      .eq('project_media_id', projectMediaId)
      .maybeSingle();

    if (error) throw new Error('Audio transcription lookup failed');
    return mapStoredTranscript(data);
  };

  return {
    findByProjectMediaId,
    async create(input) {
      const { data, error } = await client
        .from('audio_transcriptions')
        .insert({
          project_media_id: input.projectMediaId,
          transcription: input.text,
          language: input.language,
          model: input.model,
        })
        .select('id, project_media_id, transcription, language, model')
        .single();

      if (error?.code === '23505') {
        const existing = await findByProjectMediaId(input.projectMediaId);
        if (existing) return existing;
      }

      if (error) throw new Error('Audio transcription persistence failed');
      const mapped = mapStoredTranscript(data);
      if (!mapped) throw new Error('Audio transcription persistence failed');
      return mapped;
    },
  };
}
