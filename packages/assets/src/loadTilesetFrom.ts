import type { Tileset } from '@flighthq/types';

import {
  loadImageSourceFromArrayBuffer,
  loadImageSourceFromBase64,
  loadImageSourceFromBlob,
  loadImageSourceFromURL,
} from './loadImageSourceFrom';
import { tilesetFromImageSource } from './tilesetFrom';

export async function loadTilesetFromArrayBuffer(
  buffer: ArrayBuffer,
  tileWidth: number,
  tileHeight: number,
  mimeType?: string,
): Promise<Tileset> {
  return tilesetFromImageSource(await loadImageSourceFromArrayBuffer(buffer, mimeType), tileWidth, tileHeight);
}

export async function loadTilesetFromBase64(
  base64: string,
  mimeType: string,
  tileWidth: number,
  tileHeight: number,
): Promise<Tileset> {
  return tilesetFromImageSource(await loadImageSourceFromBase64(base64, mimeType), tileWidth, tileHeight);
}

export async function loadTilesetFromBlob(blob: Blob, tileWidth: number, tileHeight: number): Promise<Tileset> {
  return tilesetFromImageSource(await loadImageSourceFromBlob(blob), tileWidth, tileHeight);
}

export async function loadTilesetFromURL(
  url: string,
  tileWidth: number,
  tileHeight: number,
  crossOrigin?: string,
): Promise<Tileset> {
  return tilesetFromImageSource(await loadImageSourceFromURL(url, crossOrigin), tileWidth, tileHeight);
}
