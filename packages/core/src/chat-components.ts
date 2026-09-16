export interface QuickReplyOptionV1 {
  id: string;
  label: string;
  value?: string;
}

export interface QuickRepliesComponentV1 {
  type: 'quick_replies';
  options: QuickReplyOptionV1[];
}

export interface ActionButtonV1 {
  id: string;
  label: string;
  action: 'submit';
  value: string;
}

export interface ActionButtonsComponentV1 {
  type: 'action_buttons';
  buttons: ActionButtonV1[];
}

export interface UploadRequestComponentV1 {
  type: 'upload_request';
  mediaKinds: Array<'image' | 'audio'>;
  maxFiles: number;
  label?: string;
}

export interface NoticeComponentV1 {
  type: 'notice';
  tone: 'info' | 'success' | 'warning';
  text: string;
}

export type ChatComponentV1 =
  | QuickRepliesComponentV1
  | ActionButtonsComponentV1
  | UploadRequestComponentV1
  | NoticeComponentV1;

export interface ChatComponentEnvelopeV1 {
  version: 1;
  components: ChatComponentV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function boundedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < 1 || value.length > maxLength) return null;
  if (value.trim().length < 1) return null;
  return value;
}

function componentId(value: unknown): string | null {
  const id = boundedString(value, 64);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function parseQuickReplies(
  value: Record<string, unknown>,
): QuickRepliesComponentV1 | null {
  if (!hasOnlyKeys(value, ['type', 'options'])) return null;
  if (!Array.isArray(value.options)) return null;
  if (value.options.length < 1 || value.options.length > 4) return null;

  const ids = new Set<string>();
  const options: QuickReplyOptionV1[] = [];

  for (const rawOption of value.options) {
    if (!isRecord(rawOption)) return null;
    if (!hasOnlyKeys(rawOption, ['id', 'label', 'value'])) return null;

    const id = componentId(rawOption.id);
    const label = boundedString(rawOption.label, 80);
    if (!id || !label || ids.has(id)) return null;

    let optionValue: string | undefined;
    if (rawOption.value !== undefined) {
      const parsed = boundedString(rawOption.value, 200);
      if (!parsed) return null;
      optionValue = parsed;
    }

    ids.add(id);
    options.push({
      id,
      label,
      ...(optionValue ? { value: optionValue } : {}),
    });
  }

  return { type: 'quick_replies', options };
}

function parseActionButtons(
  value: Record<string, unknown>,
): ActionButtonsComponentV1 | null {
  if (!hasOnlyKeys(value, ['type', 'buttons'])) return null;
  if (!Array.isArray(value.buttons)) return null;
  if (value.buttons.length < 1 || value.buttons.length > 3) return null;

  const ids = new Set<string>();
  const buttons: ActionButtonV1[] = [];

  for (const rawButton of value.buttons) {
    if (!isRecord(rawButton)) return null;
    if (!hasOnlyKeys(rawButton, ['id', 'label', 'action', 'value'])) return null;

    const id = componentId(rawButton.id);
    const label = boundedString(rawButton.label, 80);
    const buttonValue = boundedString(rawButton.value, 200);
    if (
      !id ||
      !label ||
      !buttonValue ||
      rawButton.action !== 'submit' ||
      ids.has(id)
    ) {
      return null;
    }

    ids.add(id);
    buttons.push({ id, label, action: 'submit', value: buttonValue });
  }

  return { type: 'action_buttons', buttons };
}

function parseUploadRequest(
  value: Record<string, unknown>,
): UploadRequestComponentV1 | null {
  if (!hasOnlyKeys(value, ['type', 'mediaKinds', 'maxFiles', 'label'])) {
    return null;
  }
  if (!Array.isArray(value.mediaKinds)) return null;
  if (value.mediaKinds.length < 1 || value.mediaKinds.length > 2) return null;

  const allowedKinds = new Set(['image', 'audio']);
  const mediaKinds: Array<'image' | 'audio'> = [];
  for (const kind of value.mediaKinds) {
    if (typeof kind !== 'string' || !allowedKinds.has(kind)) return null;
    if (mediaKinds.includes(kind as 'image' | 'audio')) return null;
    mediaKinds.push(kind as 'image' | 'audio');
  }

  if (
    !Number.isInteger(value.maxFiles) ||
    (value.maxFiles as number) < 1 ||
    (value.maxFiles as number) > 3
  ) {
    return null;
  }

  let label: string | undefined;
  if (value.label !== undefined) {
    const parsed = boundedString(value.label, 80);
    if (!parsed) return null;
    label = parsed;
  }

  return {
    type: 'upload_request',
    mediaKinds,
    maxFiles: value.maxFiles as number,
    ...(label ? { label } : {}),
  };
}

function parseNotice(
  value: Record<string, unknown>,
): NoticeComponentV1 | null {
  if (!hasOnlyKeys(value, ['type', 'tone', 'text'])) return null;
  if (
    value.tone !== 'info' &&
    value.tone !== 'success' &&
    value.tone !== 'warning'
  ) {
    return null;
  }

  const text = boundedString(value.text, 240);
  if (!text) return null;

  return { type: 'notice', tone: value.tone, text };
}

function parseComponent(value: unknown): ChatComponentV1 | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'quick_replies':
      return parseQuickReplies(value);
    case 'action_buttons':
      return parseActionButtons(value);
    case 'upload_request':
      return parseUploadRequest(value);
    case 'notice':
      return parseNotice(value);
    default:
      return null;
  }
}

export function parseChatComponentEnvelope(
  value: unknown,
): ChatComponentEnvelopeV1 | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ['version', 'components'])) return null;
  if (value.version !== 1 || !Array.isArray(value.components)) return null;
  if (value.components.length < 1 || value.components.length > 4) return null;

  const components: ChatComponentV1[] = [];
  for (const rawComponent of value.components) {
    const component = parseComponent(rawComponent);
    if (!component) return null;
    components.push(component);
  }

  return { version: 1, components };
}
