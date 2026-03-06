import { type Tilemap, TilemapKind } from '@flighthq/types';

import { createTilemap } from './tilemap';

describe('createTilemap', () => {
  let tilemap: Tilemap;

  beforeEach(() => {
    tilemap = createTilemap();
  });

  it('initializes default values', () => {
    expect(tilemap.data.smoothing).toBe(true);
    expect(tilemap.data.tileAlphaEnabled).toBe(true);
    expect(tilemap.data.tileBlendModeEnabled).toBe(true);
    expect(tilemap.data.tileColorTransformEnabled).toBe(true);
    expect(tilemap.data.tileset).toBeNull();
    expect(tilemap.kind).toBe(TilemapKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        smoothing: false,
        tileAlphaEnabled: false,
        tileBlendModeEnabled: false,
        tileColorTransformEnabled: false,
        tileset: {},
      },
    };
    const obj = createTilemap(base);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
    expect(obj.data.tileAlphaEnabled).toStrictEqual(base.data.tileAlphaEnabled);
    expect(obj.data.tileBlendModeEnabled).toStrictEqual(base.data.tileBlendModeEnabled);
    expect(obj.data.tileColorTransformEnabled).toStrictEqual(base.data.tileColorTransformEnabled);
    expect(obj.data.tileset).toStrictEqual(base.data.tileset);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTilemap(base);
    expect(obj).not.toStrictEqual(base);
  });
});
