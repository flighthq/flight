import { inverseMatrixTransformPointXY } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix } from '@flighthq/node/contract';
import { getTilemapColumnAtX, getTilemapRowAtY, getTilemapTile } from '@flighthq/tilemap/contract';
import type { Node2D, NodeAny, Tilemap } from '@flighthq/types/contract';
import { TilemapKind } from '@flighthq/types/contract';

import { registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for tilemaps: the point resolves to the *cell* under it, so
 * `describeGraphHit`'s `subIndex` becomes the cell index (`row * columns + column`) — the basis for
 * tile painting, per-tile pickup, and tile-level tooltips.
 *
 * Unlike the coarse handler, an EMPTY cell (value -1) is a miss, matching what the renderer draws:
 * a gap in the map is a hole you can click through, not a transparent hit surface.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/tilemap`, so the base interaction bundle
 * stays free of it (tree-shaken unless referenced).
 */
export function registerTilemapHitTest(): void {
  registerHitTestPrecise(TilemapKind, resolveTilemapCellIndex);
}

// -1 when the point is off the map or over an empty cell; otherwise the cell index.
function resolveTilemapCellIndex(source: NodeAny, x: number, y: number): number {
  const tilemap = source as Tilemap;
  inverseMatrixTransformPointXY(tilemapHitLocalPoint, getNodeWorldMatrix(source as Node2D), x, y);
  const column = getTilemapColumnAtX(tilemap, tilemapHitLocalPoint.x);
  const row = getTilemapRowAtY(tilemap, tilemapHitLocalPoint.y);
  if (column < 0 || row < 0) return -1;
  if (getTilemapTile(tilemap, column, row) < 0) return -1;
  return row * tilemap.data.columns + column;
}

const tilemapHitLocalPoint = { x: 0, y: 0 };
