import { createTextureAtlas } from '@flighthq/textureatlas/contract';

import { readTextureAtlasScale, resetTextureAtlasPageMeta } from './textureAtlasPageMeta';

describe('readTextureAtlasScale', () => {
  it('reads the string TexturePacker writes and the number a hand-built document may carry', () => {
    expect(readTextureAtlasScale('0.5')).toBe(0.5);
    expect(readTextureAtlasScale(2)).toBe(2);
  });

  it('falls back to 1 for an undeclared scale', () => {
    expect(readTextureAtlasScale(undefined)).toBe(1);
  });

  it('falls back to 1 rather than letting a bad value through as NaN', () => {
    // A NaN scale would not throw; it would silently poison every coordinate a consumer rescaled by
    // it, which is far harder to trace back here than a wrong-but-finite default.
    expect(readTextureAtlasScale('not-a-number')).toBe(1);
    expect(readTextureAtlasScale(0)).toBe(1);
    expect(readTextureAtlasScale(-1)).toBe(1);
  });
});

describe('resetTextureAtlasPageMeta', () => {
  it('returns every meta field to its unknown state', () => {
    const atlas = createTextureAtlas({ imageHeight: 64, imageName: 'stale.png', imageWidth: 128, scale: 0.25 });
    resetTextureAtlasPageMeta(atlas);
    expect(atlas.imageName).toBeNull();
    expect(atlas.imageWidth).toBe(0);
    expect(atlas.imageHeight).toBe(0);
    expect(atlas.scale).toBe(1);
  });

  it('leaves the regions and texture alone, which the parsers clear on their own terms', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(...createTextureAtlas().regions);
    const regions = atlas.regions;
    resetTextureAtlasPageMeta(atlas);
    expect(atlas.regions).toBe(regions);
    expect(atlas.texture).toBeNull();
  });
});
