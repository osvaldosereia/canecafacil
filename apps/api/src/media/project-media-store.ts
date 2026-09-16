export type ProjectMediaType = 'image' | 'audio' | 'document';

interface SupabaseMutationResult<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

export interface ProjectMediaSupabaseClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ): PromiseLike<SupabaseMutationResult<{ path?: string }>>;
    };
  };
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<SupabaseMutationResult<{ id?: unknown }>>;
      };
    };
  };
}

export interface StoreProjectMediaInput {
  projectId: string;
  messageId: string | null;
  mediaId: string;
  mediaType: ProjectMediaType;
  mimeType: string;
  bytes: Uint8Array;
  originalFilename: string | null;
}

export interface StoredProjectMedia {
  id: string;
  storageBucket: 'customer-uploads';
  storagePath: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
};

function safePathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Invalid ${label}`);
  return trimmed.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function buildProjectMediaPath(
  projectId: string,
  mediaId: string,
  mimeType: string,
): string {
  const project = safePathSegment(projectId, 'project id');
  const media = safePathSegment(mediaId, 'media id');
  const extension = EXTENSIONS[mimeType.toLowerCase()] ?? 'bin';
  return `${project}/${media}.${extension}`;
}

export async function storeProjectMedia(
  client: ProjectMediaSupabaseClient,
  input: StoreProjectMediaInput,
): Promise<StoredProjectMedia> {
  const storageBucket = 'customer-uploads' as const;
  const storagePath = buildProjectMediaPath(
    input.projectId,
    input.mediaId,
    input.mimeType,
  );

  const upload = await client.storage.from(storageBucket).upload(
    storagePath,
    input.bytes,
    {
      contentType: input.mimeType,
      upsert: false,
    },
  );

  if (upload.error) {
    throw new Error('Project media upload failed');
  }

  const { data, error } = await client
    .from('project_media')
    .insert({
      project_id: input.projectId,
      message_id: input.messageId,
      media_type: input.mediaType,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: input.mimeType,
      original_filename: input.originalFilename,
    })
    .select('id')
    .single();

  if (error || !data || typeof data.id !== 'string') {
    throw new Error('Project media persistence failed');
  }

  return {
    id: data.id,
    storageBucket,
    storagePath,
  };
}
