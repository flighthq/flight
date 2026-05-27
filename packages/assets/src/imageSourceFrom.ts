import { createEntity } from '@flighthq/foundation';
import type { ImageSource } from '@flighthq/types';

export function createImageSourceFromCanvas(canvas: HTMLCanvasElement): ImageSource {
  return createEntity({
    height: canvas.height,
    src: canvas,
    version: 0,
    width: canvas.width,
  });
}

export function createImageSourceFromImageBitmap(bitmap: ImageBitmap): ImageSource {
  return createEntity({
    height: bitmap.height,
    src: bitmap,
    version: 0,
    width: bitmap.width,
  });
}

export function createImageSourceFromImageElement(img: HTMLImageElement): ImageSource {
  return createEntity({
    height: img.height,
    src: img,
    version: 0,
    width: img.width,
  });
}

export function detectImageMimeType(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 4) return null;
  const b = new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength));

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';

  // GIF87a / GIF89a: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';

  // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
  if (
    buffer.byteLength >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';

  // BMP: 42 4D
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';

  return null;
}

export function isImageSourceSameOrigin(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return true;
  }
}

export async function loadImageSourceFromArrayBuffer(buffer: ArrayBuffer, mimeType?: string): Promise<ImageSource> {
  const type = mimeType ?? detectImageMimeType(buffer);
  if (type === null) {
    throw new Error('Unable to determine image type from ArrayBuffer');
  }
  return loadImageSourceFromBlob(new Blob([buffer], { type }));
}

export async function loadImageSourceFromBase64(base64: string, mimeType: string): Promise<ImageSource> {
  return loadImageSourceFromURL(`data:${mimeType};base64,${base64}`);
}

export async function loadImageSourceFromBlob(blob: Blob): Promise<ImageSource> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageSourceFromURL(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageSourceFromURL(url: string, crossOrigin?: string): Promise<ImageSource> {
  const img = new Image();
  if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
  img.src = url;
  await img.decode();
  return createImageSourceFromImageElement(img);
}
