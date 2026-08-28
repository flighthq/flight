import { createEntity } from '@flighthq/entity/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, Image } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { getImageBackend } from './imageBackend';

// Transcodes a Bitmap's raw pixels into the selected host's drawable Image representation. The
// inverse of captureBitmapFromImageResource. Lives here rather than in @flighthq/bitmap because a
// conversion belongs with the type it PRODUCES: you look for it under what you want to end up with.
export function createImageResourceFromBitmap(bitmap: Readonly<Bitmap>): Image | null {
  const backend = getImageBackend();
  if (backend.createImageFromBitmap === undefined) return null;
  return backend.createImageFromBitmap(bitmap);
}

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: canvas.height,
    kind: ImageTextureSourceKind,
    source: canvas,
    version: 0,
    width: canvas.width,
  });
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: bitmap.height,
    kind: ImageTextureSourceKind,
    source: bitmap,
    version: 0,
    width: bitmap.width,
  });
}

export function createImageResourceFromImageElement(img: HTMLImageElement): Image {
  return createEntity({
    alphaType: DECODED_ALPHA_TYPE,
    gamut: DECODED_GAMUT,
    height: img.height,
    kind: ImageTextureSourceKind,
    source: img,
    version: 0,
    width: img.width,
  });
}

export function isImageUrlSameOrigin(url: string): boolean {
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
): Promise<Image> {
  return loadImageResourceFromUrl(`data:${mimeType};base64,${base64}`, undefined, signal);
}

export async function loadImageResourceFromBlob(blob: Blob, signal?: AbortSignal): Promise<Image> {
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
): Promise<Image> {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) {
    throw new Error('Unable to determine image type from bytes');
  }
  const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadImageResourceFromBlob(new Blob([buf], { type }), signal);
}

export async function loadImageResourceFromUrl(
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<Image> {
  return getImageBackend().loadImageFromUrl(url, crossOrigin, signal);
}

// The host-decode truth for every browser-backed source; see imageResource.ts.
const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
