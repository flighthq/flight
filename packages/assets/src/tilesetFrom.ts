import type { ImageSource, TextureAtlas, Tileset } from '@flighthq/types';

import {
  loadImageSourceFromArrayBuffer,
  loadImageSourceFromBase64,
  loadImageSourceFromBlob,
  loadImageSourceFromURL,
} from './imageSourceFrom';
import { createTextureAtlas } from './textureAtlas';
import { buildTilesetRegions, createTileset } from './tileset';

export function createTilesetFromAtlas(atlas: TextureAtlas, tileWidth: number, tileHeight: number): Tileset {
  const image = atlas.image;
  const columns = image !== null ? Math.floor(image.width / tileWidth) : 0;
  const rows = image !== null ? Math.floor(image.height / tileHeight) : 0;
  const tileset = createTileset({ atlas, columns, rows, tileHeight, tileWidth });
  buildTilesetRegions(tileset);
  return tileset;
}

export function createTilesetFromImageSource(source: ImageSource, tileWidth: number, tileHeight: number): Tileset {
  return createTilesetFromAtlas(createTextureAtlas({ image: source }), tileWidth, tileHeight);
}

export async function loadTilesetFromArrayBuffer(
  buffer: ArrayBuffer,
  tileWidth: number,
  tileHeight: number,
  mimeType?: string,
): Promise<Tileset> {
  return createTilesetFromImageSource(await loadImageSourceFromArrayBuffer(buffer, mimeType), tileWidth, tileHeight);
}

export async function loadTilesetFromBase64(
  base64: string,
  mimeType: string,
  tileWidth: number,
  tileHeight: number,
): Promise<Tileset> {
  return createTilesetFromImageSource(await loadImageSourceFromBase64(base64, mimeType), tileWidth, tileHeight);
}

export async function loadTilesetFromBlob(blob: Blob, tileWidth: number, tileHeight: number): Promise<Tileset> {
  return createTilesetFromImageSource(await loadImageSourceFromBlob(blob), tileWidth, tileHeight);
}

export async function loadTilesetFromURL(
  url: string,
  tileWidth: number,
  tileHeight: number,
  crossOrigin?: string,
): Promise<Tileset> {
  return createTilesetFromImageSource(await loadImageSourceFromURL(url, crossOrigin), tileWidth, tileHeight);
}
