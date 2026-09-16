export interface WhatsAppMediaClientConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  fetchImpl?: typeof fetch;
}

export interface DownloadedWhatsAppMedia {
  mediaId: string;
  mimeType: string;
  sha256: string | null;
  fileSize: number | null;
  bytes: Uint8Array;
}

export interface WhatsAppMediaClient {
  download(mediaId: string): Promise<DownloadedWhatsAppMedia>;
}

interface MediaMetadata {
  id: string;
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Invalid WhatsApp media ${name}`);
  return normalized;
}

function isMediaMetadata(value: unknown): value is MediaMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.url === 'string' &&
    typeof row.mime_type === 'string' &&
    (row.sha256 === undefined || typeof row.sha256 === 'string') &&
    (row.file_size === undefined || typeof row.file_size === 'number')
  );
}

export function createWhatsAppMediaClient(
  config: WhatsAppMediaClientConfig,
): WhatsAppMediaClient {
  const accessToken = required(config.accessToken, 'access token');
  const phoneNumberId = required(config.phoneNumberId, 'phone number id');
  const graphVersion = required(config.graphVersion, 'Graph API version');
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async download(mediaIdInput: string): Promise<DownloadedWhatsAppMedia> {
      const mediaId = required(mediaIdInput, 'id');
      const metadataUrl = new URL(
        `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(mediaId)}`,
      );
      metadataUrl.searchParams.set('phone_number_id', phoneNumberId);

      const metadataResponse = await fetchImpl(metadataUrl.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!metadataResponse.ok) {
        throw new Error(
          `WhatsApp media metadata request failed with status ${metadataResponse.status}`,
        );
      }

      const metadata: unknown = await metadataResponse.json();
      if (!isMediaMetadata(metadata) || metadata.id !== mediaId) {
        throw new Error('WhatsApp media metadata response was invalid');
      }

      const downloadResponse = await fetchImpl(metadata.url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!downloadResponse.ok) {
        throw new Error(
          `WhatsApp media download failed with status ${downloadResponse.status}`,
        );
      }

      const buffer = await downloadResponse.arrayBuffer();
      return {
        mediaId,
        mimeType: metadata.mime_type,
        sha256: metadata.sha256 ?? null,
        fileSize: metadata.file_size ?? null,
        bytes: new Uint8Array(buffer),
      };
    },
  };
}
