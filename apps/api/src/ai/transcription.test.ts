import { describe, expect, it, vi } from 'vitest';
import {
  transcribeAudio,
  type AudioTranscriptionStore,
  type TranscriptionProvider,
} from './transcription.js';

describe('audio transcription', () => {
  it('reuses an existing transcription for the same project media', async () => {
    const provider: TranscriptionProvider = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'novo texto',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
    };

    const store: AudioTranscriptionStore = {
      findByProjectMediaId: vi.fn().mockResolvedValue({
        id: 'transcription-1',
        projectMediaId: 'media-row-1',
        text: 'texto já salvo',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
      create: vi.fn(),
    };

    const result = await transcribeAudio(
      {
        projectMediaId: 'media-row-1',
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
      findByProjectMediaId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'transcription-2',
        projectMediaId: 'media-row-2',
        text: 'quero uma caneca floral',
        language: 'pt',
        model: 'gpt-4o-mini-transcribe',
      }),
    };

    const result = await transcribeAudio(
      {
        projectMediaId: 'media-row-2',
        bytes: new Uint8Array([9, 8, 7]),
        filename: 'audio.ogg',
        mimeType: 'audio/ogg',
      },
      { provider, store },
    );

    expect(provider.transcribe).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledWith({
      projectMediaId: 'media-row-2',
      text: 'quero uma caneca floral',
      language: 'pt',
      model: 'gpt-4o-mini-transcribe',
    });
    expect(result).toMatchObject({
      id: 'transcription-2',
      text: 'quero uma caneca floral',
      reused: false,
    });
  });
});
