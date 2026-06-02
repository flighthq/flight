import { createMatrix } from '@flighthq/geometry';
import { createDisplayObject } from '@flighthq/scene-display';

import { ImageCacheKind } from './imageCacheKind';
import { createImageCachePrimitive, isImageCachePrimitive } from './imageCachePrimitive';

describe('createImageCachePrimitive', () => {
  it('creates an image cache presentation primitive for a display object', () => {
    const owner = createDisplayObject();
    const cache = { source: null, transform: createMatrix() };
    const primitive = createImageCachePrimitive(owner, cache);
    expect(primitive.cache).toBe(cache);
    expect(primitive.kind).toBe(ImageCacheKind);
    expect(primitive.owner).toBe(owner);
  });
});

describe('isImageCachePrimitive', () => {
  it('returns false for non-image-cache values', () => {
    expect(isImageCachePrimitive(null)).toBe(false);
    expect(isImageCachePrimitive(createDisplayObject())).toBe(false);
  });

  it('returns true for image-cache primitives', () => {
    const primitive = createImageCachePrimitive(createDisplayObject(), { source: null, transform: createMatrix() });
    expect(isImageCachePrimitive(primitive)).toBe(true);
  });
});
