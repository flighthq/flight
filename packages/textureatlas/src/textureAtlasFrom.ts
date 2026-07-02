import {
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromBytes,
  loadImageResourceFromUrl,
} from '@flighthq/image';
import type { ImageResource, TextureAtlas } from '@flighthq/types';

import { createTextureAtlas } from './textureAtlas';

export function createTextureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({ image: createImageResourceFromCanvas(canvas) });
}

export function createTextureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({ image: createImageResourceFromImageBitmap(bitmap) });
}

export function createTextureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({ image: createImageResourceFromImageElement(img) });
}

export function createTextureAtlasFromImageResource(resource: ImageResource): TextureAtlas {
  return createTextureAtlas({ image: resource });
}

export async function loadTextureAtlasFromBase64(
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBase64(base64, mimeType, signal));
}

export async function loadTextureAtlasFromBlob(blob: Blob, signal?: AbortSignal): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBlob(blob, signal));
}

export async function loadTextureAtlasFromBytes(
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBytes(bytes, mimeType, signal));
}

export async function loadTextureAtlasFromUrl(
  url: string,
  crossOrigin?: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromUrl(url, crossOrigin, signal));
}
