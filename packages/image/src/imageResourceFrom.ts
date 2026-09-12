import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, HostImageProvider, ImageResource } from '@flighthq/types/contract';

export function createImageResourceFromBitmap(
  hostImage: Readonly<HostImageProvider>,
  bitmap: Readonly<Bitmap>,
): ImageResource | null {
  const backend = hostImage;
  if (backend.createImageFromBitmap === undefined) return null;
  return backend.createImageFromBitmap(bitmap);
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
  hostImage: Readonly<HostImageProvider>,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  return loadImageResourceFromUrl(hostImage, `data:${mimeType};base64,${base64}`, undefined, signal);
}

export async function loadImageResourceFromBlob(
  hostImage: Readonly<HostImageProvider>,
  blob: Blob,
  signal?: AbortSignal,
): Promise<ImageResource> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageResourceFromUrl(hostImage, url, undefined, signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageResourceFromBytes(
  hostImage: Readonly<HostImageProvider>,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<ImageResource> {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) {
    throw new Error('Unable to determine image type from bytes');
  }
  const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadImageResourceFromBlob(hostImage, new Blob([buf], { type }), signal);
}

export async function loadImageResourceFromUrl(
  hostImage: Readonly<HostImageProvider>,
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<ImageResource> {
  return hostImage.loadImageFromUrl(url, crossOrigin, signal);
}
