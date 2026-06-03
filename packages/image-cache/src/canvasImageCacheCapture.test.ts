import { setRectangle } from '@flighthq/geometry';
import { createCanvasRenderState } from '@flighthq/render-canvas';
import { getLocalBoundsRectangle } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';

import {
  beginDisplayObjectImageCacheCapture,
  captureDisplayObjectImageCache,
  endDisplayObjectImageCacheCapture,
} from './canvasImageCacheCapture';
import { getImageCache } from './imageCache';

function makeCacheState() {
  const canvas = document.createElement('canvas');
  return createCanvasRenderState(canvas);
}

describe('beginDisplayObjectImageCacheCapture', () => {
  it('resizes the canvas to the source bounds', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 64, 48);

    beginDisplayObjectImageCacheCapture(cacheState, source);

    expect(cacheState.canvas.width).toBe(64);
    expect(cacheState.canvas.height).toBe(48);
  });

  it('uses a minimum canvas size of 1 when bounds are zero', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();

    beginDisplayObjectImageCacheCapture(cacheState, source);

    expect(cacheState.canvas.width).toBe(1);
    expect(cacheState.canvas.height).toBe(1);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    expect(() => beginDisplayObjectImageCacheCapture(cacheState, source)).not.toThrow();
  });
});

describe('captureDisplayObjectImageCache', () => {
  it('sets imageCache on the source', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 64, 48);

    captureDisplayObjectImageCache(state, source);

    const cache = getImageCache(source);
    expect(cache).not.toBeNull();
    expect(cache!.source).not.toBeNull();
  });

  it('uses a separate render target canvas, not the state canvas', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 64, 48);

    captureDisplayObjectImageCache(state, source);

    const cache = getImageCache(source);
    expect(cache!.source!.src).not.toBe(state.canvas);
    expect(cache!.source!.src).toBeInstanceOf(HTMLCanvasElement);
  });

  it('sets cache transform with zero offset when there is no padding', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 5, 10, 64, 48);

    captureDisplayObjectImageCache(state, source);

    const cache = getImageCache(source);
    expect(cache!.transform.tx).toBe(5);
    expect(cache!.transform.ty).toBe(10);
  });

  it('shifts the cache transform outward by padding', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 5, 10, 64, 48);

    captureDisplayObjectImageCache(state, source, { padding: 8 });

    const cache = getImageCache(source);
    // cacheTransform.tx = bounds.x - contentX = 5 - 8 = -3
    expect(cache!.transform.tx).toBe(-3);
    expect(cache!.transform.ty).toBe(2);
  });

  it('increments version on subsequent captures', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);

    captureDisplayObjectImageCache(state, source);
    const v1 = getImageCache(source)!.source!.version;

    captureDisplayObjectImageCache(state, source);
    const v2 = getImageCache(source)!.source!.version;

    expect(v2).toBe((v1 + 1) >>> 0);
  });

  it('restores the state canvas after capture', () => {
    const state = makeCacheState();
    const originalCanvas = state.canvas;
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);

    captureDisplayObjectImageCache(state, source);

    expect(state.canvas).toBe(originalCanvas);
  });

  it('does not throw with zero bounds', () => {
    const state = makeCacheState();
    const source = createDisplayObject();
    expect(() => captureDisplayObjectImageCache(state, source)).not.toThrow();
  });
});

describe('endDisplayObjectImageCacheCapture', () => {
  it('sets imageCache on the source with an ImageSource backed by the cache canvas', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);
    beginDisplayObjectImageCacheCapture(cacheState, source);

    endDisplayObjectImageCacheCapture(cacheState, source);

    const cache = getImageCache(source);
    expect(cache).not.toBeNull();
    expect(cache!.source).not.toBeNull();
    expect(cache!.source!.src).toBe(cacheState.canvas);
  });

  it('sets cache transform with bounds offset', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 5, 10, 64, 48);
    beginDisplayObjectImageCacheCapture(cacheState, source);

    endDisplayObjectImageCacheCapture(cacheState, source);

    const cache = getImageCache(source);
    expect(cache!.transform.tx).toBe(5);
    expect(cache!.transform.ty).toBe(10);
  });

  it('increments version on subsequent captures', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(source), 0, 0, 32, 32);

    beginDisplayObjectImageCacheCapture(cacheState, source);
    endDisplayObjectImageCacheCapture(cacheState, source);
    const v1 = getImageCache(source)!.source!.version;

    beginDisplayObjectImageCacheCapture(cacheState, source);
    endDisplayObjectImageCacheCapture(cacheState, source);
    const v2 = getImageCache(source)!.source!.version;

    expect(v2).toBe((v1 + 1) >>> 0);
  });

  it('does not throw', () => {
    const cacheState = makeCacheState();
    const source = createDisplayObject();
    beginDisplayObjectImageCacheCapture(cacheState, source);
    expect(() => endDisplayObjectImageCacheCapture(cacheState, source)).not.toThrow();
  });
});
