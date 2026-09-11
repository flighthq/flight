import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import type { Bitmap, EntityConstruction, HostImageProvider, ImageResource } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

export function createImageResourceFromBitmap(
  hostImage: Readonly<HostImageProvider>,
  bitmap: Readonly<Bitmap>,
): ImageResource | null {
  const backend = hostImage;
  if (backend.createImageFromBitmap === undefined) return null;
  return backend.createImageFromBitmap(bitmap);
}

export function createImageResourceFromCanvas(canvas: HTMLCanvasElement): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromCanvas(out, canvas);
  return finishEntity(out);
}

export function createImageResourceFromImageBitmap(bitmap: ImageBitmap): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromImageBitmap(out, bitmap);
  return finishEntity(out);
}

export function createImageResourceFromImageElement(img: HTMLImageElement): ImageResource {
  const out = allocateEntity<ImageResource>();
  initializeImageResourceFromImageElement(out, img);
  return finishEntity(out);
}

export function initializeImageResourceFromCanvas(
  out: EntityConstruction<ImageResource>,
  canvas: HTMLCanvasElement,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = canvas.height;
  out.kind = ImageTextureSourceKind;
  out.source = canvas;
  out.version = 0;
  out.width = canvas.width;
}

export function initializeImageResourceFromImageBitmap(
  out: EntityConstruction<ImageResource>,
  bitmap: ImageBitmap,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = bitmap.height;
  out.kind = ImageTextureSourceKind;
  out.source = bitmap;
  out.version = 0;
  out.width = bitmap.width;
}

export function initializeImageResourceFromImageElement(
  out: EntityConstruction<ImageResource>,
  img: HTMLImageElement,
): void {
  out.alphaType = DECODED_ALPHA_TYPE;
  out.gamut = DECODED_GAMUT;
  out.height = img.height;
  out.kind = ImageTextureSourceKind;
  out.source = img;
  out.version = 0;
  out.width = img.width;
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

const DECODED_ALPHA_TYPE = 'straight';
const DECODED_GAMUT = 'srgb';
