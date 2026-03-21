import type { TextureAtlasRegion } from '@flighthq/types';

import { createTextureAtlasRegion } from './textureAtlasRegion';

describe('createTextureAtlasRegion', () => {
  let region: TextureAtlasRegion;

  beforeEach(() => {
    region = createTextureAtlasRegion();
  });

  it('initializes default values', () => {
    expect(region.x).toStrictEqual(0);
    expect(region.y).toStrictEqual(0);
    expect(region.id).toStrictEqual(-1);
    expect(region.pivotX).toStrictEqual(0);
    expect(region.pivotY).toStrictEqual(0);
    expect(region.width).toStrictEqual(0);
    expect(region.height).toStrictEqual(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      id: 5,
      pivotX: 6,
      pivotY: 7,
    };
    const obj = createTextureAtlasRegion(base);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
    expect(obj.width).toStrictEqual(base.width);
    expect(obj.height).toStrictEqual(base.height);
    expect(obj.id).toStrictEqual(base.id);
    expect(obj.pivotX).toStrictEqual(base.pivotX);
    expect(obj.pivotY).toStrictEqual(base.pivotY);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlasRegion(base);
    expect(obj).not.toStrictEqual(base);
  });
});
