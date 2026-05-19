import type { TextureAtlas } from '@flighthq/types';

import {
  loadImageSourceFromArrayBuffer,
  loadImageSourceFromBase64,
  loadImageSourceFromBlob,
  loadImageSourceFromURL,
} from './loadImageSourceFrom';
import { textureAtlasFromImageSource } from './textureAtlasFrom';

export async function loadTextureAtlasFromArrayBuffer(buffer: ArrayBuffer, mimeType?: string): Promise<TextureAtlas> {
  return textureAtlasFromImageSource(await loadImageSourceFromArrayBuffer(buffer, mimeType));
}

export async function loadTextureAtlasFromBase64(base64: string, mimeType: string): Promise<TextureAtlas> {
  return textureAtlasFromImageSource(await loadImageSourceFromBase64(base64, mimeType));
}

export async function loadTextureAtlasFromBlob(blob: Blob): Promise<TextureAtlas> {
  return textureAtlasFromImageSource(await loadImageSourceFromBlob(blob));
}

export async function loadTextureAtlasFromURL(url: string, crossOrigin?: string): Promise<TextureAtlas> {
  return textureAtlasFromImageSource(await loadImageSourceFromURL(url, crossOrigin));
}
