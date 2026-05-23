import type { Tileset } from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import { createTilemap, fillTiles, getTile, resizeTilemap, setTile } from './tilemap';

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

describe('getTile', () => {
  it('returns -1 for out-of-bounds coordinates', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    expect(getTile(tilemap, -1, 0)).toBe(-1);
    expect(getTile(tilemap, 3, 0)).toBe(-1);
    expect(getTile(tilemap, 0, -1)).toBe(-1);
    expect(getTile(tilemap, 0, 3)).toBe(-1);
  });

  it('returns -1 for empty cells', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    expect(getTile(tilemap, 0, 0)).toBe(-1);
  });

  it('reads back what setTile wrote', () => {
    const tilemap = createTilemap({ data: { columns: 4, rows: 4 } });
    setTile(tilemap, 2, 1, 7);
    expect(getTile(tilemap, 2, 1)).toBe(7);
  });
});

describe('setTile', () => {
  it('stores tiles in row-major order', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 3 } });
    setTile(tilemap, 1, 0, 42); // index = row(0) * cols(3) + col(1) = 1
    expect(tilemap.data.tiles[1]).toBe(42);
  });

  it('silently ignores out-of-bounds writes', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    setTile(tilemap, -1, 0, 5);
    setTile(tilemap, 2, 0, 5);
    setTile(tilemap, 0, -1, 5);
    setTile(tilemap, 0, 2, 5);
    expect(Array.from(tilemap.data.tiles)).toEqual([-1, -1, -1, -1]);
  });

  it('can set the empty sentinel -1', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    setTile(tilemap, 0, 0, 3);
    setTile(tilemap, 0, 0, -1);
    expect(getTile(tilemap, 0, 0)).toBe(-1);
  });
});

describe('fillTiles', () => {
  it('fills all cells with the given id', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    fillTiles(tilemap, 3);
    expect(Array.from(tilemap.data.tiles)).toEqual([3, 3, 3, 3]);
  });

  it('clears all tiles with -1', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    fillTiles(tilemap, 5);
    fillTiles(tilemap, -1);
    expect(Array.from(tilemap.data.tiles)).toEqual([-1, -1, -1, -1]);
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
    setTile(tilemap, 0, 0, 1);
    setTile(tilemap, 1, 1, 2);
    resizeTilemap(tilemap, 2, 2);
    expect(getTile(tilemap, 0, 0)).toBe(1);
    expect(getTile(tilemap, 1, 1)).toBe(2);
  });

  it('fills new cells with -1 when growing', () => {
    const tilemap = createTilemap({ data: { columns: 2, rows: 2 } });
    setTile(tilemap, 0, 0, 5);
    resizeTilemap(tilemap, 4, 4);
    expect(getTile(tilemap, 0, 0)).toBe(5);
    expect(getTile(tilemap, 3, 3)).toBe(-1);
  });

  it('correctly re-indexes tiles after resize', () => {
    const tilemap = createTilemap({ data: { columns: 3, rows: 2 } });
    // row 1, col 2 → raw index = 1*3 + 2 = 5
    setTile(tilemap, 2, 1, 9);
    resizeTilemap(tilemap, 4, 3);
    // after resize, row 1, col 2 → raw index = 1*4 + 2 = 6
    expect(getTile(tilemap, 2, 1)).toBe(9);
  });
});
