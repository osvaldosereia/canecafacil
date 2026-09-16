import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseAudioTranscriptionStore,
  transcribeAudio,
  type AudioTranscriptionStore,
  type TranscriptionProvider,
} from './transcription.js';

describe('audio transcription', () => {
  it('reuses an existing transcription for the same media asset', async () => {
    const provider: TranscriptionProvider = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'novo texto',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
    };

    const store: AudioTranscriptionStore = {
      findByMediaAssetId: vi.fn().mockResolvedValue({
        id: 'transcription-1',
        mediaAssetId: 'media-row-1',
        text: 'texto já salvo',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
      create: vi.fn(),
    };

    const result = await transcribeAudio(
      {
        mediaAssetId: 'media-row-1',
        bytes: new Uint8Array([1, 2, 3]),
        filename: 'audio.ogg',
        mimeType: 'audio/ogg',
      },
      { provider, store },
    );

    expect(provider.transcribe).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'transcription-1',
      mediaAssetId: 'media-row-1',
      text: 'texto já salvo',
      reused: true,
    });
  });

  it('transcribes once and persists the result when none exists', async () => {
    const provider: TranscriptionProvider = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'quero uma caneca floral',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
    };

    const store: AudioTranscriptionStore = {
      findByMediaAssetId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'transcription-2',
        mediaAssetId: 'media-row-2',
        text: 'quero uma caneca floral',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
    };

    const result = await transcribeAudio(
      {
        mediaAssetId: 'media-row-2',
        bytes: new Uint8Array([9, 8, 7]),
        filename: 'audio.ogg',
        mimeType: 'audio/ogg',
      },
      { provider, store },
    );

    expect(provider.transcribe).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledWith({
      mediaAssetId: 'media-row-2',
      text: 'quero uma caneca floral',
      language: 'pt',
      model: 'gpt-4o-mini-transcribe',
    });
    expect(result).toMatchObject({
      id: 'transcription-2',
      mediaAssetId: 'media-row-2',
      text: 'quero uma caneca floral',
      reused: false,
    });
  });

  it('queries Supabase with media_asset_id', async () => {
    const eq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'transcription-3',
          media_asset_id: 'media-row-3',
          transcription: 'áudio salvo',
          language: 'pt',
          model: 'gpt-4o-mini-transcribe',
        },
        error: null,
      }),
    });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn().mockReturnValue({
        select,
        insert: vi.fn(),
      }),
    };

    const store = createSupabaseAudioTranscriptionStore(client);
    await expect(store.findByMediaAssetId('media-row-3')).resolves.toMatchObject({
      mediaAssetId: 'media-row-3',
      text: 'áudio salvo',
    });

    expect(select).toHaveBeenCalledWith(
      'id, media_asset_id, transcription, language, model',
    );
    expect(eq).toHaveBeenCalledWith('media_asset_id', 'media-row-3');
  });
});
