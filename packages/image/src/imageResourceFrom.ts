import { createEntity } from '@flighthq/entity';
import { detectImageMimeType } from '@flighthq/image-codec';
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
