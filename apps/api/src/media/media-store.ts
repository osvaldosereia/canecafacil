export type ChatMediaType = 'image' | 'audio';

export interface ChatMediaAsset {
  id: string;
  conversationId: string;
  mediaType: ChatMediaType;
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface SaveChatMediaInput {
  mediaId: string;
  visitorId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  mediaType: ChatMediaType;
  bytes: Uint8Array;
}

export interface ChatMediaStore {
  save(input: SaveChatMediaInput): Promise<ChatMediaAsset>;
}
