import {
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromBytes,
  loadImageResourceFromUrl,
} from '@flighthq/image/contract';
import { createTexture, getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { ImageResource, TextureAtlas, Tileset } from '@flighthq/types/contract';

import { buildTilesetRegions, createTileset } from './tileset';

// Derives rows/columns from the atlas image size, honoring margin and inter-tile spacing.
// `margin` is the number of pixels of padding between the tile grid and the image edge.
// `spacing` is the number of pixels between adjacent tiles (inner gap).
export function createTilesetFromAtlas(
  atlas: TextureAtlas,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
): Tileset {
  const texture = atlas.texture;
  const columns =
    texture !== null && tileWidth > 0
      ? Math.floor((getTextureWidth(texture) - margin * 2 + spacing) / (tileWidth + spacing))
      : 0;
  const rows =
    texture !== null && tileHeight > 0
      ? Math.floor((getTextureHeight(texture) - margin * 2 + spacing) / (tileHeight + spacing))
      : 0;
  const tileset = createTileset({ atlas, columns, margin, rows, spacing, tileHeight, tileWidth });
  buildTilesetRegions(tileset);
  return tileset;
}

export function createTilesetFromImageResource(
  resource: ImageResource,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
): Tileset {
  return createTilesetFromAtlas(
    createTextureAtlas({ texture: createTexture({ storage: { dimension: '2d', image: resource } }) }),
    tileWidth,
    tileHeight,
    margin,
    spacing,
  );
}

export async function loadTilesetFromBase64(
  base64: string,
  mimeType: string,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
  signal?: AbortSignal,
): Promise<Tileset> {
  return createTilesetFromImageResource(
    await loadImageResourceFromBase64(base64, mimeType, signal),
    tileWidth,
    tileHeight,
    margin,
    spacing,
  );
}

export async function loadTilesetFromBlob(
  blob: Blob,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
  signal?: AbortSignal,
): Promise<Tileset> {
  return createTilesetFromImageResource(
    await loadImageResourceFromBlob(blob, signal),
    tileWidth,
    tileHeight,
    margin,
    spacing,
  );
}

export async function loadTilesetFromBytes(
  bytes: Uint8Array,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<Tileset> {
  return createTilesetFromImageResource(
    await loadImageResourceFromBytes(bytes, mimeType, signal),
    tileWidth,
    tileHeight,
    margin,
    spacing,
  );
}

export async function loadTilesetFromUrl(
  url: string,
  tileWidth: number,
  tileHeight: number,
  margin: number = 0,
  spacing: number = 0,
  crossOrigin?: string,
  signal?: AbortSignal,
): Promise<Tileset> {
  return createTilesetFromImageResource(
    await loadImageResourceFromUrl(url, crossOrigin, signal),
    tileWidth,
    tileHeight,
    margin,
    spacing,
  );
}
