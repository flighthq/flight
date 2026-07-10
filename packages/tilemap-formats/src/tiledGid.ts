import type { TiledGid, TiledMap, TiledTilesetRef } from '@flighthq/types';

// Decodes a raw 32-bit Tiled global tile id into its tile id plus the three flip flags. Tiled packs
// horizontal/vertical/anti-diagonal flip into the top three bits and the global tile id into the low
// 29 bits (0 = empty cell). The value is read as unsigned so a GID with the high (horizontal) bit set
// does not read back negative.
export function decodeTiledGid(gid: number): TiledGid {
  const g = gid >>> 0;
  return {
    flipDiagonal: (g & FLIP_DIAGONAL) !== 0,
    flipHorizontal: (g & FLIP_HORIZONTAL) !== 0,
    flipVertical: (g & FLIP_VERTICAL) !== 0,
    tileId: g & TILE_ID_MASK,
  };
}

// Finds the tileset reference that owns a decoded global tile id — the ref with the largest
// `firstGid` less than or equal to `tileId`. Returns null for an empty tile (`tileId <= 0`) or a
// tile below every declared range. Refs need not be sorted; the whole list is scanned.
export function getTiledTilesetRefForGid(map: Readonly<TiledMap>, tileId: number): TiledTilesetRef | null {
  if (tileId <= 0) return null;
  let best: TiledTilesetRef | null = null;
  for (const ref of map.tilesets) {
    if (ref.firstGid <= tileId && (best === null || ref.firstGid > best.firstGid)) best = ref;
  }
  return best;
}

const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_DIAGONAL = 0x20000000;
const TILE_ID_MASK = 0x1fffffff;
