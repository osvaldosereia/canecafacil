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

/** Replaces only one 1200×960 half of the print canvas, preserving the other half. */
export async function composeSideArtwork(
  existingArtUrl: string | null,
  side: MugArtSide,
  file: File,
): Promise<File> {
  validateSourceFile(file);
  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file);
  } catch {
    throw new Error('invalid_studio_input');
  }
  if (!source.width || !source.height) throw new Error('invalid_studio_input');

  const { canvas, context } = createCanvas(MUG_ART_WIDTH, MUG_ART_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, MUG_ART_WIDTH, MUG_ART_HEIGHT);

  if (existingArtUrl) {
    const existing = await imageFromUrl(existingArtUrl);
    if (existing.width !== MUG_ART_WIDTH || existing.height !== MUG_ART_HEIGHT) {
      throw new Error('studio_art_dimensions_invalid');
    }
    context.drawImage(existing, 0, 0);
    existing.close();
  }

  const x = side === 'left' ? 0 : MUG_SIDE_WIDTH;
  context.fillStyle = '#ffffff';
  context.fillRect(x, 0, MUG_SIDE_WIDTH, MUG_ART_HEIGHT);

  const insetX = Math.round(MUG_SIDE_WIDTH * 0.025);
  const insetY = Math.round(MUG_ART_HEIGHT * 0.025);
  const scale = Math.min(
    (MUG_SIDE_WIDTH - insetX * 2) / source.width,
    (MUG_ART_HEIGHT - insetY * 2) / source.height,
  );
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const drawX = x + Math.round((MUG_SIDE_WIDTH - width) / 2);
  const drawY = Math.round((MUG_ART_HEIGHT - height) / 2);
  context.drawImage(source, drawX, drawY, width, height);
  source.close();

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
