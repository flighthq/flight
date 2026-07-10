import { createTilemapData } from '@flighthq/sprite';
import type { TiledMap, TilemapData, Tileset } from '@flighthq/types';

import { decodeTiledGid, getTiledTilesetRefForGid } from './tiledGid';
import type { TiledTilesetResolver } from './tiledOptions';

// Projects one Tiled tile layer into runtime `TilemapData`, split by tileset. A Flight `Tilemap`
// batches a single tileset per draw, so a layer that draws from N tilesets becomes N single-tileset
// `TilemapData` (each grid holds only its own tiles, `-1` elsewhere) that the caller stacks in a
// container — the batching-correct decomposition. The common single-tileset layer returns a
// 1-element array.
//
// Each cell's raw GID is decoded to a global tile id; its owning `TiledTilesetRef` is found by
// firstGid range and resolved to a runtime `Tileset` via `resolveTileset`. The stored tile is the
// local id (`globalTileId - firstGid`). Flip flags are decoded for range/identity purposes but are
// NOT carried into the grid: `TilemapData` has no per-tile flip slot, so flips survive only in the
// faithful `TiledMap` document, not in the projected tilemap.
//
// Returns null when `layerIndex` is out of range or not a tile layer, or when resolution fails
// wholesale (no referenced tileset resolves). A ref that resolves to null when others succeed has its
// tiles left empty (`-1`) rather than failing the whole projection.
export function buildTilemapLayersFromTiled(
  map: Readonly<TiledMap>,
  layerIndex: number,
  resolveTileset: TiledTilesetResolver,
): TilemapData[] | null {
  const layer = map.layers[layerIndex];
  if (layer === undefined || layer.type !== 'tilelayer') return null;

  const { width, height, data } = layer;
  const cellCount = width * height;

  // One accumulator per resolved tileset, kept in first-appearance order for deterministic output.
  const groups: TilesetGroup[] = [];
  const byFirstGid = new Map<number, TilesetGroup | null>();
  let anyResolved = false;

  for (let i = 0; i < cellCount; i++) {
    const { tileId } = decodeTiledGid(data[i]);
    if (tileId <= 0) continue;
    const ref = getTiledTilesetRefForGid(map, tileId);
    if (ref === null) continue;

    let group = byFirstGid.get(ref.firstGid);
    if (group === undefined) {
      const tileset = resolveTileset(ref);
      if (tileset === null) {
        // Remember the failure so its tiles stay empty without re-resolving each cell.
        byFirstGid.set(ref.firstGid, null);
        group = null;
      } else {
        anyResolved = true;
        group = { firstGid: ref.firstGid, tiles: new Int16Array(cellCount).fill(-1), tileset };
        byFirstGid.set(ref.firstGid, group);
        groups.push(group);
      }
    }
    if (group === null) continue;
    group.tiles[i] = tileId - group.firstGid;
  }

  if (!anyResolved) return null;

  return groups.map((group) =>
    createTilemapData({ columns: width, rows: height, tiles: group.tiles, tileset: group.tileset }),
  );
}

interface TilesetGroup {
  firstGid: number;
  tiles: Int16Array;
  tileset: Tileset;
}
