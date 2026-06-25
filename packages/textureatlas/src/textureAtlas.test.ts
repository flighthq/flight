import { createImageResource } from '@flighthq/image';
import type { ImageResource, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';

import { createTextureAtlas, getTextureAtlasByteSize } from './textureAtlas';

describe('createTextureAtlas', () => {
  let atlas: TextureAtlas;

  beforeEach(() => {
    atlas = createTextureAtlas();
  });

  it('allows pre-defined values', () => {
    const base = {
      image: {} as ImageResource,
      regions: [{} as TextureAtlasRegion],
    };
    const obj = createTextureAtlas(base);
    expect(obj.image).toStrictEqual(base.image);
    expect(obj.regions).toStrictEqual(base.regions);
  });

  it('initializes default values', () => {
    expect(atlas.image).toBeNull();
    expect(atlas.regions).toEqual([]);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlas(base);
    expect(obj).not.toStrictEqual(base);
  });

  it('uses a provided regions array directly', () => {
    const regions = [{} as TextureAtlasRegion];
    const atlas = createTextureAtlas({ regions });
    expect(atlas.regions).toBe(regions);
  });
});

describe('getTextureAtlasByteSize', () => {
  it('returns 0 when the atlas has no image', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('returns 0 when the atlas image has no data (element-only)', () => {
    const image = createImageResource();
    const atlas = createTextureAtlas({ image });
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('returns the image data byteLength when data is present', () => {
    const image = createImageResource();
    image.data = new Uint8ClampedArray(256);
    const atlas = createTextureAtlas({ image });
    expect(getTextureAtlasByteSize(atlas)).toBe(256);
  });
});
