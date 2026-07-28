import { createEntity } from '@flighthq/entity/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, ImageResource } from '@flighthq/types/contract';
import { ImageTextureBackingKind } from '@flighthq/types/contract';

// Transcodes a Bitmap's raw pixels into an element-backed ImageResource, via a detached canvas.
// The inverse of captureBitmapFromImageResource. Lives here rather than in @flighthq/bitmap because a
// conversion belongs with the type it PRODUCES: you look for it under what you want to end up with.
// Allocates a fresh canvas on every call; callers that draw repeatedly should hold the result.
export function createImageResourceFromBitmap(bitmap: Readonly<Bitmap>): ImageResource {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const domImageData = new globalThis.ImageData(bitmap.width, bitmap.height);
  domImageData.data.set(bitmap.data);
  canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
  return createEntity({
    height: canvas.height,
    kind: ImageTextureBackingKind,
    source: canvas,
    version: 0,
    width: canvas.width,
  });
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): ImageResource {
  return createEntity({
    height: bitmap.height,
    kind: ImageTextureBackingKind,
    source: bitmap,
    version: 0,
    width: bitmap.width,
  });
}

export function createImageResourceFromImageElement(img: HTMLImageElement): ImageResource {
  return createEntity({
    height: img.height,
    kind: ImageTextureBackingKind,
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
