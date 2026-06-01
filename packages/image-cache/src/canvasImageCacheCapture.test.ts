import { setRectangle } from '@flighthq/geometry';
import { getLocalBoundsRectangle } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { createCanvasRenderState } from '@flighthq/render-canvas';

import { beginCanvasDisplayObjectImageCache, endCanvasDisplayObjectImageCache } from './canvasImageCacheCapture';
import { getImageCache } from './imageCache';

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

    expect(cacheState.canvas.width).toBe(64);
    expect(cacheState.canvas.height).toBe(48);
  });

  it('uses a minimum canvas size of 1 when bounds are zero', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();

    beginCanvasDisplayObjectImageCache(cacheState, source);

    expect(cacheState.canvas.width).toBe(1);
    expect(cacheState.canvas.height).toBe(1);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    expect(() => beginCanvasDisplayObjectImageCache(cacheState, source)).not.toThrow();
  });
});

describe('endCanvasDisplayObjectImageCache', () => {
  it('sets imageCache on the source with an ImageSource backed by the cache canvas', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);
    beginCanvasDisplayObjectImageCache(cacheState, source);

    endCanvasDisplayObjectImageCache(cacheState, source);

    const cache = getImageCache(source);
    expect(cache).not.toBeNull();
    expect(cache!.source).not.toBeNull();
    expect(cache!.source!.src).toBe(cacheState.canvas);
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

  it('increments version on subsequent captures', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);

    beginCanvasDisplayObjectImageCache(cacheState, source);
    endCanvasDisplayObjectImageCache(cacheState, source);
    const v1 = getImageCache(source)!.source!.version;

    beginCanvasDisplayObjectImageCache(cacheState, source);
    endCanvasDisplayObjectImageCache(cacheState, source);
    const v2 = getImageCache(source)!.source!.version;

    expect(v2).toBe((v1 + 1) >>> 0);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    beginCanvasDisplayObjectImageCache(cacheState, source);
    expect(() => endCanvasDisplayObjectImageCache(cacheState, source)).not.toThrow();
  });
});
