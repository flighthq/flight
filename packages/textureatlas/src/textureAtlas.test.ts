import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Bitmap, TextureAtlas, TextureAtlasRegion } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import {
  createTextureAtlas,
  disposeTextureAtlas,
  getTextureAtlasByteSize,
  initializeTextureAtlas,
} from './textureAtlas';

function createTextureAtlasRegionForTest(): TextureAtlasRegion {
  return {
    height: 1,
    id: 0,
    name: null,
    originalHeight: null,
    originalWidth: null,
    pivotX: null,
    pivotY: null,
    rotated: false,
    sourceX: 0,
    sourceY: 0,
    trimmed: false,
    width: 1,
    x: 0,
    y: 0,
  } as TextureAtlasRegion;
}

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

describe('disposeTextureAtlas', () => {
  it('drops the regions and the texture reference, leaving the atlas reusable', () => {
    const atlas = createTextureAtlas({
      regions: [createTextureAtlasRegionForTest()],
      texture: createTexture(),
    });
    disposeTextureAtlas(atlas);
    expect(atlas.regions.length).toBe(0);
    expect(atlas.texture).toBeNull();
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('does not destroy the texture it was handed — the caller may still be using it', () => {
    const texture = createTexture();
    const atlas = createTextureAtlas({ texture });
    disposeTextureAtlas(atlas);
    // The atlas has let go of it; the object the caller supplied is untouched and still usable.
    expect(texture.dimension).toBe('2d');
    expect(texture.source).toBeNull();
  });

  it('is idempotent', () => {
    const atlas = createTextureAtlas({ texture: createTexture() });
    disposeTextureAtlas(atlas);
    expect(() => disposeTextureAtlas(atlas)).not.toThrow();
    expect(atlas.texture).toBeNull();
  });
});

describe('getTextureAtlasByteSize', () => {
  it('returns 0 when the atlas has no image', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('returns 0 when the atlas image has no data (element-only)', () => {
    const image = createImageResource(globalThis.document.createElement('canvas'));
    const atlas = createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
    expect(getTextureAtlasByteSize(atlas)).toBe(0);
  });

  it('returns the image data byteLength when data is present', () => {
    const image = {
      alphaType: 'straight',
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(256),
      format: 'rgba8unorm',
      height: 8,
      kind: BitmapTextureSourceKind,
      version: 0,
      width: 8,
    } as unknown as Bitmap;
    const atlas = createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
    expect(getTextureAtlasByteSize(atlas)).toBe(256);
  });
});
describe('initializeTextureAtlas', () => {
  it('is the construction initializer of createTextureAtlas', () => {
    expect(typeof initializeTextureAtlas).toBe('function');
  });
});
