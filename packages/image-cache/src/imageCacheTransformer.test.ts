import { createMatrix } from '@flighthq/geometry';
import { createCanvasRenderState, renderCanvasDisplayObject } from '@flighthq/render-canvas';
import { createRenderState, updateDisplayObjectBeforeRender } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';

import { setImageCache } from './imageCache';
import { ImageCacheKind } from './imageCacheKind';
import {
  markImageCacheCapturing,
  registerImageCacheRenderer,
  unmarkImageCacheCapturing,
} from './imageCacheTransformer';

function makeCanvasState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

function makeRenderer() {
  return { createData: () => null, draw: vi.fn(), drawMask: vi.fn() };
}

function makeImageCache() {
  const offscreen = document.createElement('canvas');
  offscreen.width = 50;
  offscreen.height = 50;
  return {
    source: { src: offscreen, width: 50, height: 50, version: 0 } as any,
    transform: createMatrix(),
  };
}

describe('markImageCacheCapturing', () => {
  it('suppresses the image cache transformer while capturing', () => {
    const state = makeCanvasState();
    const mockRenderer = makeRenderer();
    registerImageCacheRenderer(state, mockRenderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    markImageCacheCapturing(state);
    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(mockRenderer.draw).not.toHaveBeenCalled();
  });
});

describe('registerImageCacheRenderer', () => {
  it('registers the renderer for ImageCacheKind', () => {
    const state = createRenderState();
    const renderer = makeRenderer();
    registerImageCacheRenderer(state, renderer);
    expect(state.rendererMap.get(ImageCacheKind)).toBe(renderer);
  });

  it('adds the kind transformer exactly once per state', () => {
    const state = createRenderState();
    registerImageCacheRenderer(state, makeRenderer());
    registerImageCacheRenderer(state, makeRenderer());
    expect((state as any).displayObjectKindTransformers).toHaveLength(1);
  });

  it('updates the renderer when called again with a different renderer', () => {
    const state = createRenderState();
    const r1 = makeRenderer();
    const r2 = makeRenderer();
    registerImageCacheRenderer(state, r1);
    registerImageCacheRenderer(state, r2);
    expect(state.rendererMap.get(ImageCacheKind)).toBe(r2);
  });
});

describe('unmarkImageCacheCapturing', () => {
  it('restores the image cache transformer after unmarking', () => {
    const state = makeCanvasState();
    const mockRenderer = makeRenderer();
    registerImageCacheRenderer(state, mockRenderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    markImageCacheCapturing(state);
    unmarkImageCacheCapturing(state);

    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(mockRenderer.draw).toHaveBeenCalledOnce();
  });

  it('is a no-op when state was not marked', () => {
    const state = makeCanvasState();
    const mockRenderer = makeRenderer();
    registerImageCacheRenderer(state, mockRenderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    unmarkImageCacheCapturing(state);
    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(mockRenderer.draw).toHaveBeenCalledOnce();
  });
});
