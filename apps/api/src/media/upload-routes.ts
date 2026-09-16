import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { ChatSessionStore } from '../chat/session-store.js';
import { hashSessionToken } from '../chat/session-token.js';
import type { ChatMediaStore, ChatMediaType } from './media-store.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export interface ChatUploadRouteConfig {
  sessionStore: ChatSessionStore;
  mediaStore: ChatMediaStore;
  chatOrigin: string;
  sessionCookieName: string;
  now?: () => Date;
  createMediaId?: () => string;
}

function classifyMedia(file: File): {
  mediaType: ChatMediaType;
  maxBytes: number;
} | null {
  if (IMAGE_TYPES.has(file.type)) {
    return { mediaType: 'image', maxBytes: IMAGE_MAX_BYTES };
  }
  if (AUDIO_TYPES.has(file.type)) {
    return { mediaType: 'audio', maxBytes: AUDIO_MAX_BYTES };
  }
  return null;
}

export function registerChatUploadRoutes(
  app: Hono,
  config: ChatUploadRouteConfig,
): void {
  const now = config.now ?? (() => new Date());
  const createMediaId = config.createMediaId ?? randomUUID;

  app.post('/v1/chat/media', async (context) => {
    if (context.req.header('Origin') !== config.chatOrigin) {
      return context.json({ error: 'origin_not_allowed' }, 403);
    }

    const rawToken = getCookie(context, config.sessionCookieName);
    if (!rawToken) return context.json({ error: 'session_not_found' }, 401);

    const currentTime = now();
    const identity = await config.sessionStore.resolve(
      hashSessionToken(rawToken),
      currentTime,
    );
    if (!identity) return context.json({ error: 'session_not_found' }, 401);

    let body: Record<string, string | File>;
    try {
      body = await context.req.parseBody();
    } catch {
      return context.json({ error: 'invalid_upload' }, 400);
    }

    const file = body.file;
    if (!(file instanceof File)) {
      return context.json({ error: 'file_required' }, 400);
    }

    const classification = classifyMedia(file);
    if (!classification) {
      return context.json({ error: 'unsupported_media_type' }, 415);
    }
    if (file.size > classification.maxBytes) {
      return context.json({ error: 'media_too_large' }, 413);
    }

    await config.sessionStore.touch(identity, currentTime);
    const asset = await config.mediaStore.save({
      mediaId: createMediaId(),
      visitorId: identity.visitorId,
      conversationId: identity.conversationId,
      filename: file.name || 'upload',
      mimeType: file.type,
      mediaType: classification.mediaType,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return context.json(asset, 201);
  });
}
