import { describe, expect, it } from 'vitest';
import { parseChatComponentEnvelope } from './chat-components.js';

describe('chat component protocol', () => {
  it('accepts a compact versioned quick-reply envelope', () => {
    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'quick_replies',
            options: [
              {
                id: 'from-scratch',
                label: 'Criar do zero',
                value: 'Quero criar do zero',
              },
              {
                id: 'reference',
                label: 'Tenho uma referência',
              },
            ],
          },
        ],
      }),
    ).toEqual({
      version: 1,
      components: [
        {
          type: 'quick_replies',
          options: [
            {
              id: 'from-scratch',
              label: 'Criar do zero',
              value: 'Quero criar do zero',
            },
            {
              id: 'reference',
              label: 'Tenho uma referência',
            },
          ],
        },
      ],
    });
  });

  it('accepts only bounded action, upload and notice components', () => {
    const parsed = parseChatComponentEnvelope({
      version: 1,
      components: [
        {
          type: 'action_buttons',
          buttons: [
            {
              id: 'continue',
              label: 'Continuar',
              action: 'submit',
              value: 'Continuar',
            },
          ],
        },
        {
          type: 'upload_request',
          mediaKinds: ['image', 'audio'],
          maxFiles: 3,
          label: 'Enviar referências',
        },
        {
          type: 'notice',
          tone: 'info',
          text: 'Você pode mandar até três imagens.',
        },
      ],
    });

    expect(parsed?.components).toHaveLength(3);
  });

  it('rejects unknown versions and arbitrary HTML components', () => {
    expect(
      parseChatComponentEnvelope({
        version: 2,
        components: [{ type: 'notice', tone: 'info', text: 'Oi' }],
      }),
    ).toBeNull();

    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          { type: 'html', html: '<script>alert(1)</script>' },
        ],
      }),
    ).toBeNull();
  });

  it('rejects unexpected properties instead of passing provider JSON through', () => {
    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'notice',
            tone: 'info',
            text: 'Tudo certo',
            dangerous: '<img onerror=alert(1)>',
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects duplicate IDs and oversized or empty labels', () => {
    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'quick_replies',
            options: [
              { id: 'same', label: 'A' },
              { id: 'same', label: 'B' },
            ],
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'action_buttons',
            buttons: [{ id: 'go', label: '', action: 'submit', value: 'ok' }],
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'quick_replies',
            options: [{ id: 'long', label: 'x'.repeat(81) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects invalid upload requests and excessive component counts', () => {
    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: [
          {
            type: 'upload_request',
            mediaKinds: ['video'],
            maxFiles: 1,
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseChatComponentEnvelope({
        version: 1,
        components: Array.from({ length: 5 }, (_, index) => ({
          type: 'notice',
          tone: 'info',
          text: `Aviso ${index + 1}`,
        })),
      }),
    ).toBeNull();
  });
});
