import type { TextureAtlas, Tileset } from '@flighthq/types';

import { createImageSourceFromImageElement } from './imageSourceFrom';
import { createTextureAtlas } from './textureAtlas';
import { createTileset, initTilesetRegions } from './tileset';

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

describe('initTilesetRegions', () => {
  it('positions regions at (column * tileWidth, row * tileHeight)', () => {
    const source = createImageSourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32 });
    initTilesetRegions(tileset);
    // region 0: column=0, row=0 → x=0, y=0
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    // region 1: column=1, row=0 → x=32, y=0
    expect(atlas.regions[1].x).toBe(32);
    expect(atlas.regions[1].y).toBe(0);
  });

  it('advances y by tileHeight for each row', () => {
    const source = createImageSourceFromImageElement({ width: 32, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 1, rows: 2, tileWidth: 32, tileHeight: 32 });
    initTilesetRegions(tileset);
    // region 0: column=0, row=0 → x=0, y=0
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    // region 1: column=0, row=1 → x=0, y=32
    expect(atlas.regions[1].x).toBe(0);
    expect(atlas.regions[1].y).toBe(32);
  });
});
