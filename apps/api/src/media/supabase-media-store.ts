import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatMediaAsset,
  ChatMediaStore,
  SaveChatMediaInput,
} from './media-store.js';

const CUSTOMER_UPLOADS_BUCKET = 'customer-uploads';

type MediaAssetRow = {
  id: string;
  conversation_id: string;
  media_type: ChatMediaAsset['mediaType'];
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  created_at: string;
};

function sanitizeFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop()?.trim() || 'upload';
  const sanitized = basename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'upload';
}

function storagePath(input: SaveChatMediaInput): string {
  return [
    'own-chat',
    input.visitorId,
    input.conversationId,
    input.mediaId,
    sanitizeFilename(input.filename),
  ].join('/');
}

function mapAsset(row: MediaAssetRow): ChatMediaAsset {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    mediaType: row.media_type,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export function createSupabaseChatMediaStore(client: SupabaseClient): ChatMediaStore {
  return {
    async save(input) {
      const path = storagePath(input);
      const bucket = client.storage.from(CUSTOMER_UPLOADS_BUCKET);
      const upload = await bucket.upload(path, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });

      if (upload.error) {
        throw new Error(`Failed to upload chat media: ${upload.error.message}`);
      }

      const inserted = await client
        .from('media_assets')
        .insert({
          id: input.mediaId,
          project_id: null,
          message_id: null,
          conversation_id: input.conversationId,
          media_type: input.mediaType,
          storage_bucket: CUSTOMER_UPLOADS_BUCKET,
          storage_path: path,
          mime_type: input.mimeType,
          original_filename: input.filename,
          size_bytes: input.bytes.byteLength,
        })
        .select('*')
        .single();

      if (inserted.error || !inserted.data) {
        await bucket.remove([path]);
        throw new Error(
          `Failed to persist chat media metadata: ${inserted.error?.message ?? 'unknown error'}`,
        );
      }

      return mapAsset(inserted.data as MediaAssetRow);
    },
  };
}
