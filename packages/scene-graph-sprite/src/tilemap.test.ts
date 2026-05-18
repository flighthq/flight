import type { Tilemap, Tileset } from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import { createTilemap } from './tilemap';

describe('createTilemap', () => {
  let tilemap: Tilemap;

  beforeEach(() => {
    tilemap = createTilemap();
  });

  it('initializes default values', () => {
    expect(tilemap.data.width).toBe(0);
    expect(tilemap.data.height).toBe(0);
    expect(tilemap.data.tileset).toBeNull();
    expect(tilemap.kind).toBe(TilemapKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        width: 100,
        height: 200,
        tileset: {} as Tileset,
      },
    };
    const obj = createTilemap(base);
    expect(obj.data.width).toStrictEqual(base.data.width);
    expect(obj.data.height).toStrictEqual(base.data.height);
    expect(obj.data.tileset).toStrictEqual(base.data.tileset);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTilemap(base);
    expect(obj).not.toStrictEqual(base);
  });
});
