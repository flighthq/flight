import { createEntity } from '@flighthq/entity';
import type { ImageResource } from '@flighthq/types';

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
  return createEntity({
    alphaType: 'straight',
    data: null,
    format: 'rgba8unorm',
    height: canvas.height,
    source: canvas,
    version: 0,
    width: canvas.width,
  });
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): ImageResource {
  return createEntity({
    alphaType: 'straight',
    data: null,
    format: 'rgba8unorm',
    height: bitmap.height,
    source: bitmap,
    version: 0,
    width: bitmap.width,
  });
}

export function createImageResourceFromImageElement(img: HTMLImageElement): ImageResource {
  return createEntity({
    alphaType: 'straight',
    data: null,
    format: 'rgba8unorm',
    height: img.height,
    source: img,
    version: 0,
    width: img.width,
  });
}

export function detectImageMimeType(data: ArrayBuffer | Uint8Array): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';

  // GIF87a / GIF89a: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';

  // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
  if (
    b.byteLength >= 12 &&
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

export function isImageResourceSameOrigin(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return true;
  }
}

export async function loadImageResourceFromBase64(
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  return loadImageResourceFromUrl(`data:${mimeType};base64,${base64}`, undefined, signal);
}

export async function loadImageResourceFromBlob(blob: Blob, signal?: AbortSignal): Promise<ImageResource> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageResourceFromUrl(url, undefined, signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageResourceFromBytes(
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) {
    throw new Error('Unable to determine image type from bytes');
  }
  const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadImageResourceFromBlob(new Blob([buf], { type }), signal);
}

export async function loadImageResourceFromUrl(
  url: string,
  crossOrigin?: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  signal?.throwIfAborted();
  const img = new Image();
  if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
  img.src = url;
  // Wire abort to cancel the pending decode by rejecting the promise.
  if (signal !== undefined) {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ]);
  } else {
    await img.decode();
  }
  return createImageResourceFromImageElement(img);
}
