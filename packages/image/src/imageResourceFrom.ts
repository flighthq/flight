import { createEntity } from '@flighthq/entity';
import { detectImageMimeType } from '@flighthq/image-codec';
import type { ImageResource } from '@flighthq/types';

// Materializes a data-backed ImageResource's raw pixels into a detached, drawable HTMLCanvasElement
// via putImageData. The inverse of createImageResourceFromCanvas: it turns the portable `data`
// representation of a generated Surface into the host element that Canvas/DOM `drawImage` needs.
// Returns null for an element-only resource (no `data` to transcode). Straight-alpha in, straight-alpha
// out — the drawn canvas matches the source's `alphaType`. Callers that draw data-only resources cache
// the result keyed on `version`; this primitive allocates a fresh canvas on every call.
export function createCanvasFromImageResource(image: Readonly<ImageResource>): HTMLCanvasElement | null {
  if (image.data === null) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const imageData = new globalThis.ImageData(image.width, image.height);
  imageData.data.set(image.data);
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  return canvas;
}

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
  return createEntity({
    alphaType: 'straight',
    compressed: null,
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
    compressed: null,
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
    compressed: null,
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
