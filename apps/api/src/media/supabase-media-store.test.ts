import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseChatMediaStore } from './supabase-media-store.js';

function asSupabaseClient(value: unknown): SupabaseClient {
  return value as SupabaseClient;
}

const assetRow = {
  id: '9a97ceeb-c99c-48d7-a7f8-3b954011a23f',
  conversation_id: 'conversation-1',
  media_type: 'image',
  storage_bucket: 'customer-uploads',
  storage_path:
    'own-chat/visitor-1/conversation-1/9a97ceeb-c99c-48d7-a7f8-3b954011a23f/minha_foto.png',
  mime_type: 'image/png',
  original_filename: 'minha foto.png',
  size_bytes: 4,
  created_at: '2026-09-16T12:00:00.000Z',
};

describe('Supabase own-chat media store', () => {
  it('uploads to the private bucket and persists provider-neutral metadata', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: assetRow.storage_path }, error: null });
    const remove = vi.fn();
    const single = vi.fn().mockResolvedValue({ data: assetRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const client = asSupabaseClient({
      storage: {
        from: vi.fn().mockReturnValue({ upload, remove }),
      },
      from: vi.fn().mockReturnValue({ insert }),
    });
    const store = createSupabaseChatMediaStore(client);

    const asset = await store.save({
      mediaId: assetRow.id,
      visitorId: 'visitor-1',
      conversationId: 'conversation-1',
      filename: 'minha foto.png',
      mimeType: 'image/png',
      mediaType: 'image',
      bytes: new Uint8Array([1, 2, 3, 4]),
    });

    expect(upload).toHaveBeenCalledWith(
      assetRow.storage_path,
      expect.any(Uint8Array),
      { contentType: 'image/png', upsert: false },
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conversation-1',
        media_type: 'image',
        storage_bucket: 'customer-uploads',
        storage_path: assetRow.storage_path,
        mime_type: 'image/png',
        original_filename: 'minha foto.png',
        size_bytes: 4,
      }),
    );
    expect(asset).toEqual({
      id: assetRow.id,
      conversationId: 'conversation-1',
      mediaType: 'image',
      storageBucket: 'customer-uploads',
      storagePath: assetRow.storage_path,
      mimeType: 'image/png',
      originalFilename: 'minha foto.png',
      sizeBytes: 4,
      createdAt: '2026-09-16T12:00:00.000Z',
    });
    expect(asset).not.toHaveProperty('url');
  });

  it('removes the uploaded object when the metadata insert fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const client = asSupabaseClient({
      storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
      from: vi.fn().mockReturnValue({ insert }),
    });
    const store = createSupabaseChatMediaStore(client);

    await expect(
      store.save({
        mediaId: '9a97ceeb-c99c-48d7-a7f8-3b954011a23f',
        visitorId: 'visitor-1',
        conversationId: 'conversation-1',
        filename: 'audio.ogg',
        mimeType: 'audio/ogg',
        mediaType: 'audio',
        bytes: new Uint8Array([1, 2]),
      }),
    ).rejects.toThrow('Failed to persist chat media metadata');

    expect(remove).toHaveBeenCalledWith([
      'own-chat/visitor-1/conversation-1/9a97ceeb-c99c-48d7-a7f8-3b954011a23f/audio.ogg',
    ]);
  });
});
