import type { ImageResource, TextureAtlas } from '@flighthq/types';

import {
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  loadImageResourceFromArrayBuffer,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromURL,
} from './imageResourceFrom';
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

export async function loadTextureAtlasFromArrayBuffer(buffer: ArrayBuffer, mimeType?: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromArrayBuffer(buffer, mimeType));
}

export async function loadTextureAtlasFromBase64(base64: string, mimeType: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBase64(base64, mimeType));
}

export async function loadTextureAtlasFromBlob(blob: Blob): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromBlob(blob));
}

export async function loadTextureAtlasFromURL(url: string, crossOrigin?: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageResource(await loadImageResourceFromURL(url, crossOrigin));
}
