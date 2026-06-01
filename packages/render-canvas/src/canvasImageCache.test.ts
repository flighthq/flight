import { setRectangle } from '@flighthq/geometry';
import { getImageCache } from '@flighthq/image-cache';
import { getLocalBoundsRectangle } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { beginCanvasDisplayObjectImageCache, endCanvasDisplayObjectImageCache } from './canvasImageCache';
import { createCanvasRenderState } from './canvasRenderState';
import type { CanvasRenderStateInternal } from './internal';

function makeCacheState() {
  const canvas = document.createElement('canvas');
  return createCanvasRenderState(canvas);
}

describe('beginCanvasDisplayObjectImageCache', () => {
  it('resizes the canvas to the source bounds', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 64, 48);

    beginCanvasDisplayObjectImageCache(cacheState, source);

    expect((cacheState as CanvasRenderStateInternal).canvas.width).toBe(64);
    expect((cacheState as CanvasRenderStateInternal).canvas.height).toBe(48);
  });

  it('uses a minimum canvas size of 1 when bounds are zero', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();

    beginCanvasDisplayObjectImageCache(cacheState, source);

    expect((cacheState as CanvasRenderStateInternal).canvas.width).toBe(1);
    expect((cacheState as CanvasRenderStateInternal).canvas.height).toBe(1);
  });

  it('sets skipImageCache to true', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();

    beginCanvasDisplayObjectImageCache(cacheState, source);

    expect((cacheState as CanvasRenderStateInternal).skipImageCache).toBe(true);
  });

  it('stores bounds for endCanvasDisplayObjectImageCache', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 10, 20, 100, 80);

    beginCanvasDisplayObjectImageCache(cacheState, source);

    const internal = cacheState as CanvasRenderStateInternal;
    expect(internal.imageCacheBoundsX).toBe(10);
    expect(internal.imageCacheBoundsY).toBe(20);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    expect(() => beginCanvasDisplayObjectImageCache(cacheState, source)).not.toThrow();
  });
});

describe('endCanvasDisplayObjectImageCache', () => {
  it('clears skipImageCache', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    beginCanvasDisplayObjectImageCache(cacheState, source);

    endCanvasDisplayObjectImageCache(cacheState, source);

    expect((cacheState as CanvasRenderStateInternal).skipImageCache).toBe(false);
  });

  it('sets imageCache on the source with the cache canvas', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);
    beginCanvasDisplayObjectImageCache(cacheState, source);

    endCanvasDisplayObjectImageCache(cacheState, source);

    const cache = getImageCache(source);
    expect(cache).not.toBeNull();
    expect(cache!.canvas).toBe((cacheState as CanvasRenderStateInternal).canvas);
  });

  it('sets cache transform with bounds offset', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 5, 10, 64, 48);
    beginCanvasDisplayObjectImageCache(cacheState, source);

    endCanvasDisplayObjectImageCache(cacheState, source);

    const cache = getImageCache(source);
    expect(cache!.transform.tx).toBe(5);
    expect(cache!.transform.ty).toBe(10);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    beginCanvasDisplayObjectImageCache(cacheState, source);
    expect(() => endCanvasDisplayObjectImageCache(cacheState, source)).not.toThrow();
  });
});
