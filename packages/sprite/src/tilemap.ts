import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { createSignal } from '@flighthq/signals';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  Tilemap,
  TilemapData,
  TilemapRuntime,
  TilemapSignals,
  Vector2Like,
} from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

/** Fills all cells with -1 (empty). Equivalent to `fillTilemapTiles(tilemap, -1)`. Fires `onCleared` when signals are enabled. */
export function clearTilemap(tilemap: Tilemap): void {
  tilemap.data.tiles.fill(-1);
  const signals = getTilemapSignals(tilemap);
  if (signals !== null) signals.onCleared.emit();
}

/**
 * Deep-copies `source` into a new `Tilemap` with an independent `Int16Array` tiles buffer and a
 * fresh runtime. The new tilemap has the same `columns`, `rows`, `tileset`, and `materialData`
 * (shallow copy of the materialData array), but its `tiles` are a cloned typed array.
 */
export function cloneTilemap(source: Readonly<Tilemap>): Tilemap {
  const src = source.data;
  return createTilemap({
    data: {
      columns: src.columns,
      materialData: src.materialData !== null ? src.materialData.slice() : null,
      rows: src.rows,
      tiles: src.tiles.slice(),
      tileset: src.tileset,
    },
  });
}

export function computeTilemapLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const tilemap = source as Tilemap;
  const { tileset, columns, rows } = tilemap.data;
  out.x = 0;
  out.y = 0;
  out.width = tileset !== null ? columns * tileset.tileWidth : 0;
  out.height = tileset !== null ? rows * tileset.tileHeight : 0;
}

export function createTilemap(obj?: Readonly<PartialNode<Tilemap>>): Tilemap {
  return createDisplayObjectGeneric(TilemapKind, obj, createTilemapData, createTilemapRuntime) as Tilemap;
}

export function createTilemapData(data?: Readonly<Partial<TilemapData>>): TilemapData {
  const columns = data?.columns ?? 0;
  const rows = data?.rows ?? 0;
  return {
    columns,
    rows,
    materialData: data?.materialData ?? null,
    tiles: data?.tiles ?? new Int16Array(columns * rows).fill(-1),
    tileset: data?.tileset ?? null,
  };
}

export function createTilemapRuntime(): TilemapRuntime {
  return createDisplayObjectRuntime(defaultMethods) as TilemapRuntime;
}

export function createTilemapSignals(): TilemapSignals {
  return {
    onCleared: createSignal(),
    onTileChanged: createSignal(),
    onTilesChanged: createSignal(),
  };
}

/**
 * Opt-in signals for a `Tilemap` node. Returns the {@link TilemapSignals} group attached to
 * `target`, creating it on the first call. Zero cost until enabled — honors the `enable*` convention.
 * Use `getTilemapSignals` to read without creating.
 */
export function enableTilemapSignals(target: Tilemap): TilemapSignals {
  const s = target as TilemapWithSignals;
  return (s[tilemapSignalsSlot] ??= createTilemapSignals());
}

export function fillTilemapTiles(tilemap: Tilemap, id: number): void {
  tilemap.data.tiles.fill(id);
}

/**
 * Returns the column index for a local-space x coordinate, or -1 when the tileset is null or
 * `x` is outside the tilemap bounds. The result is a floored column index.
 */
export function getTilemapColumnAtX(source: Readonly<Tilemap>, x: number): number {
  const { tileset, columns } = source.data;
  if (tileset === null || tileset.tileWidth <= 0) return -1;
  const col = Math.floor(x / tileset.tileWidth);
  if (col < 0 || col >= columns) return -1;
  return col;
}

/**
 * Writes the column and row for a local-space point `(x, y)` into `out.x`/`out.y`.
 * Returns false when the tileset is null or the point is outside the tilemap bounds.
 * On a false return, `out` is not modified.
 */
export function getTilemapColumnRowAtPoint(out: Vector2Like, source: Readonly<Tilemap>, x: number, y: number): boolean {
  const col = getTilemapColumnAtX(source, x);
  const row = getTilemapRowAtY(source, y);
  if (col < 0 || row < 0) return false;
  out.x = col;
  out.y = row;
  return true;
}

/**
 * Returns the row index for a local-space y coordinate, or -1 when the tileset is null or
 * `y` is outside the tilemap bounds. The result is a floored row index.
 */
export function getTilemapRowAtY(source: Readonly<Tilemap>, y: number): number {
  const { tileset, rows } = source.data;
  if (tileset === null || tileset.tileHeight <= 0) return -1;
  const row = Math.floor(y / tileset.tileHeight);
  if (row < 0 || row >= rows) return -1;
  return row;
}

export function getTilemapRuntime(source: Readonly<Tilemap>): Readonly<TilemapRuntime> {
  return getDisplayObjectRuntime(source) as TilemapRuntime;
}

/** Returns the {@link TilemapSignals} attached to `source`, or `null` if not yet enabled. */
export function getTilemapSignals(source: Readonly<Tilemap>): TilemapSignals | null {
  return (source as TilemapWithSignals)[tilemapSignalsSlot] ?? null;
}

export function getTilemapTile(tilemap: Readonly<Tilemap>, column: number, row: number): number {
  const { columns, rows, tiles } = tilemap.data;
  if (column < 0 || column >= columns || row < 0 || row >= rows) return -1;
  return tiles[row * columns + column];
}

/**
 * Returns the cell value at local-space point `(x, y)`, or -1 when the tileset is null, the
 * point is outside the tilemap, or the cell is empty. Delegates to `getTilemapColumnAtX`,
 * `getTilemapRowAtY`, and `getTilemapTile`.
 */
export function getTilemapTileAtPoint(source: Readonly<Tilemap>, point: Readonly<Vector2Like>): number {
  return getTilemapTileAtPointXY(source, point.x, point.y);
}

/**
 * XY variant of `getTilemapTileAtPoint`. Returns the cell value or -1.
 */
export function getTilemapTileAtPointXY(source: Readonly<Tilemap>, x: number, y: number): number {
  const col = getTilemapColumnAtX(source, x);
  const row = getTilemapRowAtY(source, y);
  if (col < 0 || row < 0) return -1;
  return getTilemapTile(source, col, row);
}

/**
 * Writes the local-space rectangle for the cell at `(column, row)` into `out`.
 * Returns false and does not modify `out` when the tileset is null or the column/row is out of bounds.
 */
export function getTilemapTileRect(out: Rectangle, source: Readonly<Tilemap>, column: number, row: number): boolean {
  const { tileset, columns, rows } = source.data;
  if (tileset === null || column < 0 || column >= columns || row < 0 || row >= rows) return false;
  out.x = column * tileset.tileWidth;
  out.y = row * tileset.tileHeight;
  out.width = tileset.tileWidth;
  out.height = tileset.tileHeight;
  return true;
}

export function resizeTilemap(tilemap: Tilemap, columns: number, rows: number): void {
  const data = tilemap.data;
  const newTiles = new Int16Array(columns * rows).fill(-1);
  const copyColumns = Math.min(columns, data.columns);
  const copyRows = Math.min(rows, data.rows);
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyColumns; c++) {
      newTiles[r * columns + c] = data.tiles[r * data.columns + c];
    }
  }
  data.columns = columns;
  data.rows = rows;
  data.tiles = newTiles;
}

/** Sets the tile at `(column, row)`. Fires `onTileChanged` when signals are enabled. */
export function setTilemapTile(tilemap: Tilemap, column: number, row: number, id: number): void {
  const { columns, rows, tiles } = tilemap.data;
  if (column < 0 || column >= columns || row < 0 || row >= rows) return;
  tiles[row * columns + column] = id;
  const signals = getTilemapSignals(tilemap);
  if (signals !== null) signals.onTileChanged.emit(column, row, id);
}

/**
 * Blits a sub-grid of tile ids from `ids` into `tilemap` starting at (`offsetColumn`, `offsetRow`),
 * reading `width × height` tiles from `ids` in row-major order. Clips the write to the tilemap bounds —
 * out-of-range cells in the target are silently skipped. The `ids` array is read in row-major order:
 * row `r` starts at `r * width`. Fires `onTilesChanged` when signals are enabled.
 */
export function setTilemapTiles(
  tilemap: Tilemap,
  ids: ArrayLike<number>,
  offsetColumn: number,
  offsetRow: number,
  width: number,
  height: number,
): void {
  const { columns, rows, tiles } = tilemap.data;
  for (let r = 0; r < height; r++) {
    const targetRow = offsetRow + r;
    if (targetRow < 0 || targetRow >= rows) continue;
    for (let c = 0; c < width; c++) {
      const targetCol = offsetColumn + c;
      if (targetCol < 0 || targetCol >= columns) continue;
      tiles[targetRow * columns + targetCol] = ids[r * width + c];
    }
  }
  const signals = getTilemapSignals(tilemap);
  if (signals !== null) signals.onTilesChanged.emit(offsetColumn, offsetRow, width, height);
}

const defaultMethods: Partial<MethodsOf<TilemapRuntime>> = {
  computeLocalBoundsRectangle: computeTilemapLocalBoundsRectangle,
};

const tilemapSignalsSlot = Symbol('tilemapSignals');

interface TilemapWithSignals {
  [tilemapSignalsSlot]?: TilemapSignals;
}
