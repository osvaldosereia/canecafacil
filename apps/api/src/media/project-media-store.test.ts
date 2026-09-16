import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectMediaPath,
  storeProjectMedia,
  type ProjectMediaSupabaseClient,
} from './project-media-store.js';

describe('project media storage', () => {
  it('builds a deterministic private path scoped by project and media id', () => {
    expect(
      buildProjectMediaPath('project-1', 'media-123', 'image/jpeg'),
    ).toBe('project-1/media-123.jpg');
    expect(
      buildProjectMediaPath('project-1', 'audio-456', 'audio/ogg'),
    ).toBe('project-1/audio-456.ogg');
  });

  it('uploads to customer-uploads and persists the project_media record', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
    const single = vi.fn().mockResolvedValue({
      data: { id: 'project-media-row-1' },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));

    const client: ProjectMediaSupabaseClient = {
      storage: {
        from: vi.fn(() => ({ upload })),
      },
      from: vi.fn(() => ({ insert })),
    };

    const result = await storeProjectMedia(client, {
      projectId: 'project-1',
      messageId: 'message-1',
      mediaId: 'media-123',
      mediaType: 'image',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
      originalFilename: null,
    });

    expect(client.storage.from).toHaveBeenCalledWith('customer-uploads');
    expect(upload).toHaveBeenCalledWith(
      'project-1/media-123.jpg',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
    expect(client.from).toHaveBeenCalledWith('project_media');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        message_id: 'message-1',
        media_type: 'image',
        storage_bucket: 'customer-uploads',
        storage_path: 'project-1/media-123.jpg',
        mime_type: 'image/jpeg',
      }),
    );
    expect(result).toEqual({
      id: 'project-media-row-1',
      storageBucket: 'customer-uploads',
      storagePath: 'project-1/media-123.jpg',
    });
  });
});
