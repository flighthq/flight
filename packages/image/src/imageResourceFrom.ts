import { createEntity } from '@flighthq/entity/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, HasGraphicsImage, ImageResource } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

export function createImageResourceFromBitmap(
  host: Readonly<HasGraphicsImage>,
  bitmap: Readonly<Bitmap>,
): ImageResource | null {
  const backend = host.graphics.image;
  if (backend.createImageFromBitmap === undefined) return null;
  return backend.createImageFromBitmap(bitmap);
}

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
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

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): ImageResource {
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

export function createImageResourceFromImageElement(img: HTMLImageElement): ImageResource {
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
  host: Readonly<HasGraphicsImage>,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  return loadImageResourceFromUrl(host, `data:${mimeType};base64,${base64}`, undefined, signal);
}

export async function loadImageResourceFromBlob(
  host: Readonly<HasGraphicsImage>,
  blob: Blob,
  signal?: AbortSignal,
): Promise<ImageResource> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageResourceFromUrl(host, url, undefined, signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageResourceFromBytes(
  host: Readonly<HasGraphicsImage>,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) {
    throw new Error('Unable to determine image type from bytes');
  }
  const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadImageResourceFromBlob(host, new Blob([buf], { type }), signal);
}

export async function loadImageResourceFromUrl(
  host: Readonly<HasGraphicsImage>,
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<ImageResource> {
  return host.graphics.image.loadImageFromUrl(url, crossOrigin, signal);
}

const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
