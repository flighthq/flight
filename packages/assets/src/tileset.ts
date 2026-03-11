import type { Tileset } from '@flighthq/types';

import { createTextureAtlasRegion, initTextureAtlasRegion } from './textureAtlas';

export function createTileset(obj?: Partial<Tileset>): Tileset {
  return {
    atlas: obj?.atlas ?? null,
    tileWidth: obj?.tileWidth ?? 0,
    tileHeight: obj?.tileHeight ?? 0,
    rows: obj?.rows ?? 0,
    columns: obj?.columns ?? 0,
  };
}

export function initTilesetRegions(target: Tileset): void {
  const { atlas, rows, columns, tileWidth, tileHeight } = target;
  if (atlas === null) return;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (i >= atlas.regions.length) atlas.regions.push(createTextureAtlasRegion());
      initTextureAtlasRegion(atlas.regions[i], row * tileWidth, column * tileHeight, tileWidth, tileHeight);
      i++;
    }
  }
}
