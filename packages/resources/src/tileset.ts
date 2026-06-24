import { createEntity } from '@flighthq/entity';
import type { Tileset } from '@flighthq/types';

import { createTextureAtlasRegion, setTextureAtlasRegion } from './textureAtlasRegion';

// Fills or refreshes the atlas region array with one region per tile in the grid, using the
// tileset's tileWidth/tileHeight, margin (border padding), and spacing (inter-tile gap).
// Existing region objects are reused in place when the capacity matches — zero new allocations
// for repeated calls on an already-populated tileset.
export function buildTilesetRegions(target: Tileset): void {
  const { atlas, rows, columns, tileWidth, tileHeight, margin, spacing } = target;
  if (atlas === null) return;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (i >= atlas.regions.length) atlas.regions.push(createTextureAtlasRegion());
      const x = margin + column * (tileWidth + spacing);
      const y = margin + row * (tileHeight + spacing);
      setTextureAtlasRegion(atlas.regions[i], x, y, tileWidth, tileHeight);
      i++;
    }
  }
}

export function createTileset(obj?: Partial<Tileset>): Tileset {
  return createEntity({
    atlas: obj?.atlas ?? null,
    columns: obj?.columns ?? 0,
    margin: obj?.margin ?? 0,
    rows: obj?.rows ?? 0,
    spacing: obj?.spacing ?? 0,
    tileHeight: obj?.tileHeight ?? 0,
    tileWidth: obj?.tileWidth ?? 0,
  });
}
