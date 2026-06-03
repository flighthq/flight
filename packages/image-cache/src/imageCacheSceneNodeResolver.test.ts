import { createMatrix } from '@flighthq/geometry';
import { createRenderState } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode, updateDisplayObjectBeforeRender } from '@flighthq/render';
import { createCanvasRenderState, renderCanvasDisplayObject } from '@flighthq/render-canvas';
import { createDisplayObject } from '@flighthq/scene-display';

import { setImageCache } from './imageCache';
import { ImageCacheKind } from './imageCacheKind';
import { isImageCachePrimitive } from './imageCachePrimitive';
import {
  beginImageCacheCapture,
  createImageCacheSceneNodeResolver,
  endImageCacheCapture,
  isImageCacheSceneNodeResolver,
  registerImageCacheRenderer,
} from './imageCacheSceneNodeResolver';

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

describe('beginImageCacheCapture', () => {
  it('suppresses the image cache resolver while capturing', () => {
    const state = makeCanvasState();
    const mockRenderer = makeRenderer();
    registerImageCacheRenderer(state, mockRenderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    beginImageCacheCapture(state);
    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(mockRenderer.draw).not.toHaveBeenCalled();
  });
});

describe('createImageCacheSceneNodeResolver', () => {
  it('creates an image cache scene node resolver', () => {
    const resolver = createImageCacheSceneNodeResolver();
    expect(isImageCacheSceneNodeResolver(resolver)).toBe(true);
    expect(resolver.updateChildren).toBe(false);
  });
});

describe('endImageCacheCapture', () => {
  it('restores the image cache resolver after unmarking', () => {
    const state = makeCanvasState();
    const mockRenderer = makeRenderer();
    registerImageCacheRenderer(state, mockRenderer);

    const obj = createDisplayObject();
    setImageCache(obj, makeImageCache());

    beginImageCacheCapture(state);
    endImageCacheCapture(state);

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

    endImageCacheCapture(state);
    updateDisplayObjectBeforeRender(state, obj);
    renderCanvasDisplayObject(state, obj);

    expect(mockRenderer.draw).toHaveBeenCalledOnce();
  });
});

describe('ImageCacheSceneNodeResolver via setImageCache', () => {
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
    expect(isImageCachePrimitive(node.source)).toBe(true);
    expect(node.source).toMatchObject({ cache, owner: obj });
    expect(renderer.createData).toHaveBeenCalledWith(state, node.source);
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

describe('isImageCacheSceneNodeResolver', () => {
  it('returns false for non-image-cache resolver values', () => {
    expect(isImageCacheSceneNodeResolver(null)).toBe(false);
    expect(isImageCacheSceneNodeResolver({ updateChildren: false })).toBe(false);
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
