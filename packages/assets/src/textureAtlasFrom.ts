import type { ImageSource, TextureAtlas } from '@flighthq/types';

import {
  createImageSourceFromCanvas,
  createImageSourceFromImageBitmap,
  createImageSourceFromImageElement,
  loadImageSourceFromArrayBuffer,
  loadImageSourceFromBase64,
  loadImageSourceFromBlob,
  loadImageSourceFromURL,
} from './imageSourceFrom';
import { createTextureAtlas } from './textureAtlas';

export function createTextureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({ image: createImageSourceFromCanvas(canvas) });
}

export function createTextureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({ image: createImageSourceFromImageBitmap(bitmap) });
}

export function createTextureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({ image: createImageSourceFromImageElement(img) });
}

export function createTextureAtlasFromImageSource(source: ImageSource): TextureAtlas {
  return createTextureAtlas({ image: source });
}

export async function loadTextureAtlasFromArrayBuffer(buffer: ArrayBuffer, mimeType?: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageSource(await loadImageSourceFromArrayBuffer(buffer, mimeType));
}

export async function loadTextureAtlasFromBase64(base64: string, mimeType: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageSource(await loadImageSourceFromBase64(base64, mimeType));
}

export async function loadTextureAtlasFromBlob(blob: Blob): Promise<TextureAtlas> {
  return createTextureAtlasFromImageSource(await loadImageSourceFromBlob(blob));
}

export async function loadTextureAtlasFromURL(url: string, crossOrigin?: string): Promise<TextureAtlas> {
  return createTextureAtlasFromImageSource(await loadImageSourceFromURL(url, crossOrigin));
}
