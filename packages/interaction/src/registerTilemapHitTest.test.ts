import { createTilemap, fillTilemapTiles, setTilemapTile } from '@flighthq/tilemap/contract';
import type { HitTestResult, TextureAtlas, Tilemap } from '@flighthq/types/contract';

import { describeGraphHit } from './hitTests';
import { registerTilemapHitTest } from './registerTilemapHitTest';

// A 3x2 grid of 32x16 cells, every cell filled — the atlas is only a non-null presence check here.
function filledTilemap(): Tilemap {
  const tilemap = createTilemap({
    data: { atlas: {} as TextureAtlas, columns: 3, rows: 2, tileHeight: 16, tileWidth: 32 },
  });
  fillTilemapTiles(tilemap, 7);
  return tilemap;
}

function subIndexAt(tilemap: Tilemap, x: number, y: number): number {
  const out: HitTestResult = { localX: 0, localY: 0, node: tilemap, subIndex: -2 };
  describeGraphHit(tilemap, x, y, out);
  return out.subIndex;
}

beforeAll(() => {
  registerTilemapHitTest();
});

describe('registerTilemapHitTest', () => {
  it('resolves the point to a cell index, row-major', () => {
    const tilemap = filledTilemap();
    expect(subIndexAt(tilemap, 5, 5)).toBe(0);
    // Column 2 of row 0 spans x in [64, 96); row 1 spans y in [16, 32).
    expect(subIndexAt(tilemap, 70, 5)).toBe(2);
    expect(subIndexAt(tilemap, 5, 20)).toBe(3);
    expect(subIndexAt(tilemap, 70, 20)).toBe(5);
  });

  it('misses an empty cell, so a gap in the map is clicked through', () => {
    const tilemap = filledTilemap();
    setTilemapTile(tilemap, 1, 0, -1);
    expect(subIndexAt(tilemap, 40, 5)).toBe(-1);
    // Its filled neighbour still resolves, so the miss is the cell and not the whole map.
    expect(subIndexAt(tilemap, 5, 5)).toBe(0);
  });

  it('misses a point outside the grid', () => {
    const tilemap = filledTilemap();
    expect(subIndexAt(tilemap, 200, 5)).toBe(-1);
    expect(subIndexAt(tilemap, 5, 200)).toBe(-1);
    expect(subIndexAt(tilemap, -1, -1)).toBe(-1);
  });
});
