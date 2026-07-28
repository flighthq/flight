import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Bitmap, TextureAtlas, TextureAtlasRegion } from '@flighthq/types/contract';
import { BitmapTextureBackingKind } from '@flighthq/types/contract';

import { createTextureAtlas, getTextureAtlasByteSize } from './textureAtlas';

describe('createTextureAtlas', () => {
  let atlas: TextureAtlas;

  beforeEach(() => {
    atlas = createTextureAtlas();
  });

  it('allows pre-defined values', () => {
    const base = {
      regions: [{} as TextureAtlasRegion],
      texture: createTexture(),
    };
    const obj = createTextureAtlas(base);
    expect(obj.texture).toStrictEqual(base.texture);
    expect(obj.regions).toStrictEqual(base.regions);
  });

  it('initializes default values', () => {
    expect(atlas.texture).toBeNull();
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
    const image = createImageResource(globalThis.document.createElement('canvas'));
    const atlas = createTextureAtlas({ texture: createTexture({ storage: { dimension: '2d', image } }) });
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('returns the image data byteLength when data is present', () => {
    const image = {
      alphaType: 'straight',
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(256),
      format: 'rgba8unorm',
      height: 8,
      kind: BitmapTextureBackingKind,
      version: 0,
      width: 8,
    } as unknown as Bitmap;
    const atlas = createTextureAtlas({ texture: createTexture({ storage: { dimension: '2d', image } }) });
    expect(getTextureAtlasByteSize(atlas)).toBe(256);
  });
});
