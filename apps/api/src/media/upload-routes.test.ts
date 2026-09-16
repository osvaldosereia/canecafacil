import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSessionStore } from '../chat/session-store.js';
import type { ChatMediaStore } from './media-store.js';
import { registerChatUploadRoutes } from './upload-routes.js';

const sessionIdentity = {
  sessionId: 'session-1',
  visitorId: 'visitor-1',
  conversationId: 'conversation-1',
  expiresAt: '2026-10-16T12:00:00.000Z',
};

function createSessionStore(live = true): ChatSessionStore {
  return {
    create: vi.fn(),
    resolve: vi.fn().mockResolvedValue(live ? sessionIdentity : null),
    touch: vi.fn().mockResolvedValue(undefined),
  };
}

function createMediaStore(): ChatMediaStore {
  return {
    save: vi.fn().mockResolvedValue({
      id: '9a97ceeb-c99c-48d7-a7f8-3b954011a23f',
      conversationId: 'conversation-1',
      mediaType: 'image',
      storageBucket: 'customer-uploads',
      storagePath: 'own-chat/visitor-1/conversation-1/id/photo.png',
      mimeType: 'image/png',
      originalFilename: 'photo.png',
      sizeBytes: 4,
      createdAt: '2026-09-16T12:00:00.000Z',
    }),
  };
}

function createApp(options: {
  sessionStore?: ChatSessionStore;
  mediaStore?: ChatMediaStore;
}) {
  const app = new Hono();
  registerChatUploadRoutes(app, {
    sessionStore: options.sessionStore ?? createSessionStore(),
    mediaStore: options.mediaStore ?? createMediaStore(),
    chatOrigin: 'http://localhost:5174',
    sessionCookieName: 'cf_session',
    now: () => new Date('2026-09-16T12:00:00.000Z'),
    createMediaId: () => '9a97ceeb-c99c-48d7-a7f8-3b954011a23f',
  });
  return app;
}

async function upload(file: File, options: {
  origin?: string;
  includeCookie?: boolean;
  sessionStore?: ChatSessionStore;
  mediaStore?: ChatMediaStore;
} = {}) {
  const form = new FormData();
  form.set('file', file);
  return createApp(options).request('/v1/chat/media', {
    method: 'POST',
    headers: {
      Origin: options.origin ?? 'http://localhost:5174',
      ...(options.includeCookie === false ? {} : { Cookie: 'cf_session=raw-session-token' }),
    },
    body: form,
  });
}

describe('own-chat media upload routes', () => {
  it('rejects uploads from another origin before storage', async () => {
    const mediaStore = createMediaStore();
    const response = await upload(new File(['img'], 'photo.png', { type: 'image/png' }), {
      origin: 'https://evil.example',
      mediaStore,
    });
    expect(response.status).toBe(403);
    expect(mediaStore.save).not.toHaveBeenCalled();
  });

  it('rejects uploads without a live session', async () => {
    const response = await upload(new File(['img'], 'photo.png', { type: 'image/png' }), {
      sessionStore: createSessionStore(false),
    });
    expect(response.status).toBe(401);
  });

  it('accepts a supported image without returning a public URL', async () => {
    const mediaStore = createMediaStore();
    const response = await upload(new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', {
      type: 'image/png',
    }), { mediaStore });
    expect(response.status).toBe(201);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ id: '9a97ceeb-c99c-48d7-a7f8-3b954011a23f', mediaType: 'image' });
    expect(body).not.toHaveProperty('url');
    expect(mediaStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorId: 'visitor-1',
        conversationId: 'conversation-1',
        filename: 'photo.png',
        mimeType: 'image/png',
        mediaType: 'image',
      }),
    );
  });

  it('accepts supported audio', async () => {
    const mediaStore = createMediaStore();
    vi.mocked(mediaStore.save).mockResolvedValueOnce({
      id: '9a97ceeb-c99c-48d7-a7f8-3b954011a23f',
      conversationId: 'conversation-1',
      mediaType: 'audio',
      storageBucket: 'customer-uploads',
      storagePath: 'own-chat/visitor-1/conversation-1/id/audio.ogg',
      mimeType: 'audio/ogg',
      originalFilename: 'audio.ogg',
      sizeBytes: 5,
      createdAt: '2026-09-16T12:00:00.000Z',
    });
    const response = await upload(new File(['audio'], 'audio.ogg', { type: 'audio/ogg' }), {
      mediaStore,
    });
    expect(response.status).toBe(201);
    expect(mediaStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'audio', mimeType: 'audio/ogg' }),
    );
  });

  it('rejects unsupported MIME types', async () => {
    const mediaStore = createMediaStore();
    const response = await upload(new File(['x'], 'script.js', { type: 'application/javascript' }), {
      mediaStore,
    });
    expect(response.status).toBe(415);
    expect(mediaStore.save).not.toHaveBeenCalled();
  });

  it('rejects images larger than 10 MiB and audio larger than 20 MiB', async () => {
    const mediaStore = createMediaStore();
    const imageResponse = await upload(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
      { mediaStore },
    );
    expect(imageResponse.status).toBe(413);

    const audioResponse = await upload(
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.ogg', { type: 'audio/ogg' }),
      { mediaStore },
    );
    expect(audioResponse.status).toBe(413);
    expect(mediaStore.save).not.toHaveBeenCalled();
  });
});
