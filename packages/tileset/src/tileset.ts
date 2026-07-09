import { createEntity } from '@flighthq/entity';
import { createTextureAtlasRegion, setTextureAtlasRegion } from '@flighthq/textureatlas';
import type { Tileset } from '@flighthq/types';

// Fills or refreshes the atlas region array with one region per tile in the grid, using the
// tileset's tileWidth/tileHeight, margin (border padding), and spacing (inter-tile gap).
// Existing region objects are reused in place when the capacity matches — zero new allocations
// for repeated calls on an already-populated tileset. When the grid shrinks, trailing regions
// beyond the new tile count are truncated so no stale regions linger. Each region's `id` is its
// tile index (row-major), and reused regions have their `name`/`rotated`/`trimmed` metadata reset
// so `getTextureAtlasRegionById` and friends see a clean grid, not leftovers from a prior build.
export function buildTilesetRegions(target: Tileset): void {
  const { atlas, rows, columns, tileWidth, tileHeight, margin, spacing } = target;
  if (atlas === null) return;
  const regions = atlas.regions;
  const count = rows * columns;
  if (regions.length > count) regions.length = count;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (i >= regions.length) regions.push(createTextureAtlasRegion());
      const region = regions[i];
      const x = margin + column * (tileWidth + spacing);
      const y = margin + row * (tileHeight + spacing);
      setTextureAtlasRegion(region, x, y, tileWidth, tileHeight);
      region.id = i;
      region.name = null;
      region.rotated = false;
      region.trimmed = false;
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

// Releases what keeps the tileset reachable — the atlas reference — so the atlas (and its image)
// become eligible for GC once nothing else holds them. The tileset is plain GC-managed memory with
// no non-GC resource to free, so this is `dispose`, not `destroy`; the grid parameters
// (rows/columns/tile size) are left intact. Does not clear the atlas's regions: the atlas is a
// separate entity a caller may still hold, so its contents are not this tileset's to erase.
export function disposeTileset(tileset: Tileset): void {
  tileset.atlas = null;
}
