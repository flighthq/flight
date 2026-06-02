import { createMatrix } from '@flighthq/geometry';
import { createCanvasRenderState, renderCanvasDisplayObject } from '@flighthq/render-canvas';
import { createRenderState } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode, updateDisplayObjectBeforeRender } from '@flighthq/render-tree';
import { createDisplayObject } from '@flighthq/scene-display';

import { setImageCache } from './imageCache';
import { ImageCacheKind } from './imageCacheKind';
import { isImageCachePrimitive } from './imageCachePrimitive';
import {
  createImageCacheResolver,
  isImageCacheResolver,
  markImageCacheCapturing,
  registerImageCacheRenderer,
  unmarkImageCacheCapturing,
} from './imageCacheRenderNodeResolver';

function makeCanvasState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

function makeRenderer() {
  return { createData: () => null, draw: vi.fn() };
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

describe('createImageCacheResolver', () => {
  it('creates an image cache scene node resolver', () => {
    const resolver = createImageCacheResolver();
    expect(isImageCacheResolver(resolver)).toBe(true);
    expect(resolver.updateChildren).toBe(false);
  });
});

describe('ImageCacheResolver via setImageCache', () => {
  it('resolves active caches to an image cache presentation primitive', () => {
    const state = createRenderState();
    const renderer = { createData: vi.fn(() => null), draw: vi.fn() };
    registerImageCacheRenderer(state, renderer);

    const obj = createDisplayObject();
    const cache = makeImageCache();
    setImageCache(obj, cache);

    updateDisplayObjectBeforeRender(state, obj);

    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(node.kind).toBe(ImageCacheKind);
    expect(node.presentationTransform2D).toBe(cache.transform);
    expect(isImageCachePrimitive(node.presentationSource)).toBe(true);
    expect(node.presentationSource).toMatchObject({ cache, owner: obj });
    expect(renderer.createData).toHaveBeenCalledWith(state, node.presentationSource);
  });

  it('does not walk children when cache is active', () => {
    const state = createRenderState();
    registerImageCacheRenderer(state, makeRenderer());

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    updateDisplayObjectBeforeRender(state, obj);

    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(node.updateChildren).toBe(false);
  });
});

describe('isImageCacheResolver', () => {
  it('returns false for non-image-cache resolver values', () => {
    expect(isImageCacheResolver(null)).toBe(false);
    expect(isImageCacheResolver({ updateChildren: false })).toBe(false);
  });
});

describe('markImageCacheCapturing', () => {
  it('suppresses the image cache resolver while capturing', () => {
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
  it('restores the image cache resolver after unmarking', () => {
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
