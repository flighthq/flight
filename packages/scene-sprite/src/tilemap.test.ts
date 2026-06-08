import { createRectangle } from '@flighthq/geometry';
import type { SceneNode, Tileset } from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import {
  computeTilemapLocalBoundsRectangle,
  createTilemap,
  createTilemapData,
  createTilemapRuntime,
  fillTilemapTiles,
  getTilemapRuntime,
  getTilemapTile,
  resizeTilemap,
  writeTilemapTile,
} from './tilemap';

describe('computeTilemapLocalBoundsRectangle', () => {
  it('sets out dimensions from tileset and grid size', () => {
    const tileset = { tileWidth: 32, tileHeight: 16 } as Tileset;
    const tilemap = createTilemap({ data: { columns: 5, rows: 4, tileset } });
    const out = createRectangle();
    computeTilemapLocalBoundsRectangle(out, tilemap as unknown as SceneNode);
    expect(out.width).toBe(160);
    expect(out.height).toBe(64);
  });

  it('sets zero dimensions when tileset is null', () => {
    const tilemap = createTilemap({ data: { columns: 5, rows: 4 } });
    const out = createRectangle(0, 0, 99, 99);
    computeTilemapLocalBoundsRectangle(out, tilemap as unknown as SceneNode);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('createTilemap', () => {
  it('initializes default values', () => {
    const tilemap = createTilemap();
    expect(tilemap.data.columns).toBe(0);
    expect(tilemap.data.rows).toBe(0);
    expect(tilemap.data.tileset).toBeNull();
    expect(tilemap.data.tiles).toBeInstanceOf(Int16Array);
    expect(tilemap.kind).toBe(TilemapKind);
  });

  it('initializes tiles to -1 (empty)', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 2 } });
    expect(tilemap.data.tiles.length).toBe(6);
    expect(Array.from(tilemap.data.tiles)).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it('allows pre-defined values', () => {
    const base = { data: { columns: 10, rows: 5, tileset: {} as Tileset } };
    const obj = createTilemap(base);
    expect(obj.data.columns).toBe(10);
    expect(obj.data.rows).toBe(5);
    expect(obj.data.tileset).toBe(base.data.tileset);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTilemap(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createTilemapData', () => {
  it('returns default values', () => {
    const data = createTilemapData();
    expect(data.columns).toBe(0);
    expect(data.rows).toBe(0);
    expect(data.tileset).toBeNull();
    expect(data.tiles).toBeInstanceOf(Int16Array);
  });

  it('fills tiles with -1', () => {
    const data = createTilemapData({ columns: 2, rows: 3 });
    expect(Array.from(data.tiles)).toEqual([-1, -1, -1, -1, -1, -1]);
  });
});

describe('createTilemapRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createTilemapRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeTilemapLocalBoundsRectangle', () => {
    const runtime = createTilemapRuntime();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeTilemapLocalBoundsRectangle);
  });
});

describe('fillTilemapTiles', () => {
  it('fills all cells with the given id', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    fillTilemapTiles(tilemap, 3);
    expect(Array.from(tilemap.data.tiles)).toEqual([3, 3, 3, 3]);
  });

  it('clears all tiles with -1', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    fillTilemapTiles(tilemap, 5);
    fillTilemapTiles(tilemap, -1);
    expect(Array.from(tilemap.data.tiles)).toEqual([-1, -1, -1, -1]);
  });
});

describe('getTilemapRuntime', () => {
  it('returns the runtime for a Tilemap', () => {
    const tilemap = createTilemap();
    const runtime = getTilemapRuntime(tilemap);
    expect(runtime).not.toBeNull();
  });
});

describe('getTilemapTile', () => {
  it('returns -1 for out-of-bounds coordinates', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    expect(getTilemapTile(tilemap, -1, 0)).toBe(-1);
    expect(getTilemapTile(tilemap, 3, 0)).toBe(-1);
    expect(getTilemapTile(tilemap, 0, -1)).toBe(-1);
    expect(getTilemapTile(tilemap, 0, 3)).toBe(-1);
  });

  it('returns -1 for empty cells', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    expect(getTilemapTile(tilemap, 0, 0)).toBe(-1);
  });

  it('reads back what writeTilemapTile wrote', () => {
    const tilemap = createTilemap({ data: { columns: 4, rows: 4 } });
    writeTilemapTile(tilemap, 2, 1, 7);
    expect(getTilemapTile(tilemap, 2, 1)).toBe(7);
  });
});

describe('resizeTilemap', () => {
  it('updates columns and rows', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    resizeTilemap(tilemap, 5, 4);
    expect(tilemap.data.columns).toBe(5);
    expect(tilemap.data.rows).toBe(4);
  });

  it('copies surviving cells when shrinking', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    writeTilemapTile(tilemap, 0, 0, 1);
    writeTilemapTile(tilemap, 1, 1, 2);
    resizeTilemap(tilemap, 2, 2);
    expect(getTilemapTile(tilemap, 0, 0)).toBe(1);
    expect(getTilemapTile(tilemap, 1, 1)).toBe(2);
  });

  it('fills new cells with -1 when growing', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    writeTilemapTile(tilemap, 0, 0, 5);
    resizeTilemap(tilemap, 4, 4);
    expect(getTilemapTile(tilemap, 0, 0)).toBe(5);
    expect(getTilemapTile(tilemap, 3, 3)).toBe(-1);
  });

  it('correctly re-indexes tiles after resize', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 2 } });
    // row 1, col 2 -> raw index = 1*3 + 2 = 5
    writeTilemapTile(tilemap, 2, 1, 9);
    resizeTilemap(tilemap, 4, 3);
    // after resize, row 1, col 2 -> raw index = 1*4 + 2 = 6
    expect(getTilemapTile(tilemap, 2, 1)).toBe(9);
  });
});

describe('writeTilemapTile', () => {
  it('stores tiles in row-major order', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    writeTilemapTile(tilemap, 1, 0, 42); // index = row(0) * cols(3) + col(1) = 1
    expect(tilemap.data.tiles[1]).toBe(42);
  });

  it('silently ignores out-of-bounds writes', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    writeTilemapTile(tilemap, -1, 0, 5);
    writeTilemapTile(tilemap, 2, 0, 5);
    writeTilemapTile(tilemap, 0, -1, 5);
    writeTilemapTile(tilemap, 0, 2, 5);
    expect(Array.from(tilemap.data.tiles)).toEqual([-1, -1, -1, -1]);
  });

  it('can set the empty sentinel -1', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    writeTilemapTile(tilemap, 0, 0, 3);
    writeTilemapTile(tilemap, 0, 0, -1);
    expect(getTilemapTile(tilemap, 0, 0)).toBe(-1);
  });
});
