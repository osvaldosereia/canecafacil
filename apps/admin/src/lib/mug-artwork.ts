export type MugArtSide = 'left' | 'right';

export const MUG_ART_WIDTH = 2400;
export const MUG_ART_HEIGHT = 960;
export const MUG_SIDE_WIDTH = MUG_ART_WIDTH / 2;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('studio_art_export_failed');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return { canvas, context };
}

async function imageFromUrl(url: string): Promise<ImageBitmap> {
  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    throw new Error('studio_art_load_failed');
  }
  if (!response.ok) throw new Error('studio_art_load_failed');
  try {
    return await createImageBitmap(await response.blob());
  } catch {
    throw new Error('studio_art_load_failed');
  }
}

async function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  for (const quality of [0.96, 0.92, 0.88, 0.82]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) continue;
    if (blob.size <= MAX_OUTPUT_BYTES) return new File([blob], name, { type: blob.type || 'image/webp' });
  }
  throw new Error('studio_art_file_too_large');
}

function validateSourceFile(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size <= 0) {
    throw new Error('invalid_studio_input');
  }
  if (file.size > MAX_OUTPUT_BYTES) throw new Error('studio_art_file_too_large');
}

export type MugArtAdjustment = {
  file: File | null;
  size: number;
  currentSize: number;
};

/** Replaces and/or scales either print half while preserving the other half exactly. */
export async function composeSideArtworks(
  existingArtUrl: string,
  adjustments: Record<MugArtSide, MugArtAdjustment>,
): Promise<File> {
  const existing = await imageFromUrl(existingArtUrl);
  if (existing.width !== MUG_ART_WIDTH || existing.height !== MUG_ART_HEIGHT) {
    existing.close();
    throw new Error('studio_art_dimensions_invalid');
  }

  const { canvas, context } = createCanvas(MUG_ART_WIDTH, MUG_ART_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, MUG_ART_WIDTH, MUG_ART_HEIGHT);
  context.drawImage(existing, 0, 0);

  try {
    for (const side of ['left', 'right'] as const) {
      const adjustment = adjustments[side];
      if (!Number.isInteger(adjustment.size) || adjustment.size < 50 || adjustment.size > 150 || adjustment.size % 5 !== 0 ||
        !Number.isInteger(adjustment.currentSize) || adjustment.currentSize < 50 || adjustment.currentSize > 150 || adjustment.currentSize % 5 !== 0) {
        throw new Error('invalid_studio_input');
      }
      if (!adjustment.file && adjustment.size === adjustment.currentSize) continue;
      if (adjustment.file) validateSourceFile(adjustment.file);

      const source = adjustment.file ? await createImageBitmap(adjustment.file) : existing;
      const sideX = side === 'left' ? 0 : MUG_SIDE_WIDTH;
      const sourceX = adjustment.file ? 0 : sideX;
      const sourceWidth = adjustment.file ? source.width : MUG_SIDE_WIDTH;
      const sourceHeight = adjustment.file ? source.height : MUG_ART_HEIGHT;
      if (!sourceWidth || !sourceHeight) {
        if (adjustment.file) source.close();
        throw new Error('invalid_studio_input');
      }

      const relativeScale = adjustment.file ? adjustment.size / 100 : adjustment.size / adjustment.currentSize;
      const fit = Math.min(MUG_SIDE_WIDTH / sourceWidth, MUG_ART_HEIGHT / sourceHeight);
      const width = Math.max(1, Math.round(sourceWidth * fit * relativeScale));
      const height = Math.max(1, Math.round(sourceHeight * fit * relativeScale));
      const drawX = sideX + Math.round((MUG_SIDE_WIDTH - width) / 2);
      const drawY = Math.round((MUG_ART_HEIGHT - height) / 2);

      context.save();
      context.beginPath();
      context.rect(sideX, 0, MUG_SIDE_WIDTH, MUG_ART_HEIGHT);
      context.clip();
      context.fillStyle = '#ffffff';
      context.fillRect(sideX, 0, MUG_SIDE_WIDTH, MUG_ART_HEIGHT);
      context.drawImage(source, sourceX, 0, sourceWidth, sourceHeight, drawX, drawY, width, height);
      context.restore();
      if (adjustment.file) source.close();
    }
  } finally {
    existing.close();
  }

  return canvasFile(canvas, 'caneca-arte-2400x960.webp');
}

/** Crops the real left or right half for the matching handle-facing mockup. */
export async function createMockupSideReference(artUrl: string, side: MugArtSide): Promise<File> {
  const image = await imageFromUrl(artUrl);
  if (image.width !== MUG_ART_WIDTH || image.height !== MUG_ART_HEIGHT) {
    image.close();
    throw new Error('studio_art_dimensions_invalid');
  }

  const { canvas, context } = createCanvas(MUG_SIDE_WIDTH, MUG_ART_HEIGHT);
  const sourceX = side === 'left' ? 0 : MUG_SIDE_WIDTH;
  context.drawImage(image, sourceX, 0, MUG_SIDE_WIDTH, MUG_ART_HEIGHT, 0, 0, MUG_SIDE_WIDTH, MUG_ART_HEIGHT);
  image.close();
  return canvasFile(canvas, `caneca-referencia-${side}.webp`);
}

