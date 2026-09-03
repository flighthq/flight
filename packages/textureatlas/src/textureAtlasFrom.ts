import {
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromBytes,
  loadImageResourceFromUrl,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageResource, TextureAtlas } from '@flighthq/types/contract';

import { createTextureAtlas } from './textureAtlas';

export function createTextureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(canvas) }),
  });
}

export function createTextureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromImageBitmap(bitmap) }),
  });
}

export function createTextureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromImageElement(img) }),
  });
}

export function createTextureAtlasFromImageResource(resource: ImageResource): TextureAtlas {
  return createTextureAtlas({ texture: createTexture({ dimension: '2d', source: resource }) });
}

export async function loadTextureAtlasFromBase64(
  host: Readonly<HasGraphicsImage>,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBase64(host, base64, mimeType, signal));
}

export async function loadTextureAtlasFromBlob(
  host: Readonly<HasGraphicsImage>,
  blob: Blob,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBlob(host, blob, signal));
}

export async function loadTextureAtlasFromBytes(
  host: Readonly<HasGraphicsImage>,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBytes(host, bytes, mimeType, signal));
}

export async function loadTextureAtlasFromUrl(
  host: Readonly<HasGraphicsImage>,
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromUrl(host, url, crossOrigin, signal));
}
