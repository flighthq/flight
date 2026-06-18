import type { ImageResource, TextureAtlas, Tileset } from '@flighthq/types';

import {
  loadImageResourceFromArrayBuffer,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromURL,
} from './imageResourceFrom';
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

export function createTilesetFromImageResource(
  resource: ImageResource,
  tileWidth: number,
  tileHeight: number,
): Tileset {
  return createTilesetFromAtlas(createTextureAtlas({ image: resource }), tileWidth, tileHeight);
}

export async function loadTilesetFromArrayBuffer(
  buffer: ArrayBuffer,
  tileWidth: number,
  tileHeight: number,
  mimeType?: string,
): Promise<Tileset> {
  return createTilesetFromImageResource(
    await loadImageResourceFromArrayBuffer(buffer, mimeType),
    tileWidth,
    tileHeight,
  );
}

export async function loadTilesetFromBase64(
  base64: string,
  mimeType: string,
  tileWidth: number,
  tileHeight: number,
): Promise<Tileset> {
  return createTilesetFromImageResource(await loadImageResourceFromBase64(base64, mimeType), tileWidth, tileHeight);
}

export async function loadTilesetFromBlob(blob: Blob, tileWidth: number, tileHeight: number): Promise<Tileset> {
  return createTilesetFromImageResource(await loadImageResourceFromBlob(blob), tileWidth, tileHeight);
}

export async function loadTilesetFromURL(
  url: string,
  tileWidth: number,
  tileHeight: number,
  crossOrigin?: string,
): Promise<Tileset> {
  return createTilesetFromImageResource(await loadImageResourceFromURL(url, crossOrigin), tileWidth, tileHeight);
}
