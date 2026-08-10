import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createTilemapData } from '@flighthq/tilemap/contract';
import type { ImportDiagnostic, TiledMap, TiledTilesetResolver, TilemapData } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { decodeTiledGid, getTiledTilesetRefForGid } from './tiledGid';

// Projects one Tiled tile layer into runtime `TilemapData`, split by tileset. A Flight `Tilemap`
// batches a single tileset per draw, so a layer that draws from N tilesets becomes N single-tileset
// `TilemapData` (each grid holds only its own tiles, `-1` elsewhere) that the caller stacks in a
// container — the batching-correct decomposition. The common single-tileset layer returns a
// 1-element array.
//
// Each cell's raw GID is decoded to a global tile id; its owning `TiledTilesetRef` is found by
// firstGid range and resolved to runtime atlas/layout data via `resolveTileset`. The stored tile is the
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
  diagnostics?: ImportDiagnostic[],
): TilemapData[] | null {
  const layer = map.layers[layerIndex];
  if (layer === undefined || layer.type !== 'tilelayer') return null;

  const { width, height, data } = layer;
  const cellCount = width * height;

  // One accumulator per resolved tileset, kept in first-appearance order for deterministic output.
  const groups: TilesetGroup[] = [];
  const byFirstGid = new Map<number, TilesetGroup | null>();
  let anyResolved = false;
  // Counted per cell and reported ONCE after the loop. The seam's perf contract forbids a per-element
  // call in a hot loop, and a layer is width x height cells — a map with a broken tileset would
  // otherwise emit one crumb per tile and drown the very report it was meant to make.
  let cellsWithoutTileset = 0;
  let cellsLeftEmpty = 0;
  const unresolvedTilesets = new Set<number>();

  for (let i = 0; i < cellCount; i++) {
    const { tileId } = decodeTiledGid(data[i]);
    if (tileId <= 0) continue;
    const ref = getTiledTilesetRefForGid(map, tileId);
    if (ref === null) {
      cellsWithoutTileset++;
      continue;
    }

    let group = byFirstGid.get(ref.firstGid);
    if (group === undefined) {
      const layout = resolveTileset(ref);
      if (layout === null) {
        // Remember the failure so its tiles stay empty without re-resolving each cell.
        byFirstGid.set(ref.firstGid, null);
        group = null;
      } else {
        anyResolved = true;
        group = { firstGid: ref.firstGid, layout, tiles: new Int16Array(cellCount).fill(-1) };
        byFirstGid.set(ref.firstGid, group);
        groups.push(group);
      }
    }
    if (group === null) {
      cellsLeftEmpty++;
      unresolvedTilesets.add(ref.firstGid);
      continue;
    }
    group.tiles[i] = tileId - group.firstGid;
  }

  // Reported before the wholesale-failure return, so a map that loses SOME tiles and a map that loses
  // all of them are distinguishable: the first returns layers with holes in them, and without this the
  // caller sees a successful projection whose grid is quietly short of the tiles the file authored.
  if (cellsWithoutTileset > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'tiled.tile-outside-every-tileset',
      'buildTilemapLayersFromTiled',
      { cells: cellsWithoutTileset, layerIndex },
    );
  }
  if (cellsLeftEmpty > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'tiled.tileset-unresolved',
      'buildTilemapLayersFromTiled',
      { cells: cellsLeftEmpty, layerIndex, tilesets: unresolvedTilesets.size },
    );
  }

  if (!anyResolved) return null;

  return groups.map((group) =>
    createTilemapData({
      atlas: group.layout.atlas,
      columns: width,
      rows: height,
      tileHeight: group.layout.tileHeight,
      tileWidth: group.layout.tileWidth,
      tiles: group.tiles,
    }),
  );
}

interface TilesetGroup {
  firstGid: number;
  layout: NonNullable<ReturnType<TiledTilesetResolver>>;
  tiles: Int16Array;
}
