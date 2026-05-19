import type { TextureAtlas, Tileset } from '@flighthq/types';

import { createTileset } from './tileset';

describe('createTileset', () => {
  let tileset: Tileset;

  beforeEach(() => {
    tileset = createTileset();
  });

  it('initializes default values', () => {
    expect(tileset.atlas).toBeNull();
    expect(tileset.tileWidth).toStrictEqual(0);
    expect(tileset.tileHeight).toStrictEqual(0);
    expect(tileset.rows).toStrictEqual(0);
    expect(tileset.columns).toStrictEqual(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      atlas: {} as TextureAtlas,
      tileWidth: 10,
      tileHeight: 20,
      rows: 1,
      columns: 2,
    };
    const obj = createTileset(base);
    expect(obj.atlas).toStrictEqual(base.atlas);
    expect(obj.tileWidth).toStrictEqual(base.tileWidth);
    expect(obj.tileHeight).toStrictEqual(base.tileHeight);
    expect(obj.rows).toStrictEqual(base.rows);
    expect(obj.columns).toStrictEqual(base.columns);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTileset(base);
    expect(obj).not.toStrictEqual(base);
  });
});
