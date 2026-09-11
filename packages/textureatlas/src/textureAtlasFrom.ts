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
import type { HostImageProvider, ImageResource, TextureAtlas } from '@flighthq/types/contract';

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
  hostImage: Readonly<HostImageProvider>,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBase64(hostImage, base64, mimeType, signal));
}

export async function loadTextureAtlasFromBlob(
  hostImage: Readonly<HostImageProvider>,
  blob: Blob,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBlob(hostImage, blob, signal));
}

export async function loadTextureAtlasFromBytes(
  hostImage: Readonly<HostImageProvider>,
  bytes: Uint8Array,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBytes(hostImage, bytes, mimeType, signal));
}

export async function loadTextureAtlasFromUrl(
  hostImage: Readonly<HostImageProvider>,
  url: string,
  crossOrigin?: 'anonymous' | 'use-credentials',
  signal?: AbortSignal,
): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromUrl(hostImage, url, crossOrigin, signal));
}
