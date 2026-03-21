import type { ImageSource, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';

import { createTextureAtlas } from './textureAtlas';

describe('createTextureAtlas', () => {
  let atlas: TextureAtlas;

  beforeEach(() => {
    atlas = createTextureAtlas();
  });

  it('initializes default values', () => {
    expect(atlas.image).toBeNull();
    expect(atlas.regions).toEqual([]);
  });

  it('allows pre-defined values', () => {
    const base = {
      image: {} as ImageSource,
      regions: [{} as TextureAtlasRegion],
    };
    const obj = createTextureAtlas(base);
    expect(obj.image).toStrictEqual(base.image);
    expect(obj.regions).toStrictEqual(base.regions);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlas(base);
    expect(obj).not.toStrictEqual(base);
  });
});
