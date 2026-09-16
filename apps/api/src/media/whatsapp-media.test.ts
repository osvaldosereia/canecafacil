import { describe, expect, it, vi } from 'vitest';
import { createWhatsAppMediaClient } from './whatsapp-media.js';

describe('WhatsApp media client', () => {
  it('retrieves the short-lived media URL and downloads the binary with bearer auth', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messaging_product: 'whatsapp',
            url: 'https://lookaside.facebook.com/media/download-token',
            mime_type: 'audio/ogg',
            sha256: 'abc123',
            file_size: 3,
            id: 'media-123',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        }),
      );

    const client = createWhatsAppMediaClient({
      accessToken: 'secret-token',
      phoneNumberId: 'phone-1',
      graphVersion: 'v23.0',
      fetchImpl: fetchMock,
    });

    const media = await client.download('media-123');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://graph.facebook.com/v23.0/media-123?phone_number_id=phone-1',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://lookaside.facebook.com/media/download-token',
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(media).toEqual({
      mediaId: 'media-123',
      mimeType: 'audio/ogg',
      sha256: 'abc123',
      fileSize: 3,
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  it('never includes the access token in provider errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('provider failure', { status: 500 }),
    );

    const client = createWhatsAppMediaClient({
      accessToken: 'super-secret-token',
      phoneNumberId: 'phone-1',
      graphVersion: 'v23.0',
      fetchImpl: fetchMock,
    });

    await expect(client.download('media-123')).rejects.not.toThrow(
      /super-secret-token/,
    );
  });
});
