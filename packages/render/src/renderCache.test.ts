import { createMatrix } from '@flighthq/geometry';
import { createDisplayObject } from '@flighthq/scene-display';

import {
  beginImageRenderCacheCapture,
  clearImageRenderCache,
  createImageRenderCachePrimitive,
  createRenderImageCacheAdapter,
  endImageRenderCacheCapture,
  getImageRenderCache,
  ImageRenderCacheKind,
  isImageRenderCachePrimitive,
  isRenderImageCacheAdapter,
  registerImageRenderCacheRenderer,
  setImageRenderCache,
} from './renderCache';
import { registerRenderer } from './renderer';
import { createDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';

function makeImageSource() {
  const src = {} as any;
  return { src, width: 64, height: 64, version: 0 };
}

function makeCacheResult(): any {
  return { source: makeImageSource(), transform: createMatrix() };
}

describe('beginImageRenderCacheCapture', () => {
  it('does not throw', () => {
    const state = createRenderState();
    expect(() => beginImageRenderCacheCapture(state)).not.toThrow();
  });
});

describe('clearImageRenderCache', () => {
  it('removes the adapter from the scene node', () => {
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(obj as any, cache);
    clearImageRenderCache(obj as any);
    expect(getImageRenderCache(obj as any)).toBeNull();
  });
});

describe('createImageRenderCachePrimitive', () => {
  it('creates a primitive with the correct kind', () => {
    const owner = createDisplayObject();
    const cache = makeCacheResult();
    const primitive = createImageRenderCachePrimitive(owner, cache);
    expect(primitive.kind).toBe(ImageRenderCacheKind);
    expect(primitive.cache).toBe(cache);
    expect(primitive.owner).toBe(owner);
  });
});

describe('createRenderImageCacheAdapter', () => {
  it('returns an object with an adapt method and result field', () => {
    const adapter = createRenderImageCacheAdapter();
    expect(typeof adapter.adapt).toBe('function');
    expect('result' in adapter).toBe(true);
  });

  it('adapt returns null when state is capturing', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = makeCacheResult();
    beginImageRenderCacheCapture(state);
    expect(adapter.adapt(state, obj, data)).toBeNull();
    endImageRenderCacheCapture(state);
  });

  it('adapt returns null when result is null', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = null;
    expect(adapter.adapt(state, obj, data)).toBeNull();
  });

  it('adapt returns null when result source has no src', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();

    adapter.result = { source: { src: null, width: 0, height: 0, version: 0 }, transform: createMatrix() } as any;
    expect(adapter.adapt(state, obj, data)).toBeNull();
  });

  it('adapt returns false and updates node when result is valid', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = makeCacheResult();
    const result = adapter.adapt(state, obj, data);
    expect(result).toBe(false);
    expect(data.kind).toBe(ImageRenderCacheKind);
    expect(isImageRenderCachePrimitive(data.source)).toBe(true);
  });

  it('adapt reuses the same primitive across calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data1 = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = makeCacheResult();
    adapter.adapt(state, obj, data1);
    const source1 = data1.source;

    const obj2 = createDisplayObject();
    const data2 = createDisplayObjectRenderNode(state, obj2);
    adapter.adapt(state, obj2, data2);
    expect(data2.source).toBe(source1);
  });
});

describe('endImageRenderCacheCapture', () => {
  it('allows adapt to run after ending capture', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = makeCacheResult();
    beginImageRenderCacheCapture(state);
    endImageRenderCacheCapture(state);
    expect(adapter.adapt(state, obj, data)).toBe(false);
  });
});

describe('getImageRenderCache', () => {
  it('returns null when no cache is set', () => {
    const obj = createDisplayObject();
    expect(getImageRenderCache(obj as any)).toBeNull();
  });

  it('returns the cache result after setImageRenderCache', () => {
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(obj as any, cache);
    expect(getImageRenderCache(obj as any)).toBe(cache);
  });
});

describe('isImageRenderCachePrimitive', () => {
  it('returns true for a valid primitive', () => {
    const owner = createDisplayObject();
    const primitive = createImageRenderCachePrimitive(owner, makeCacheResult());
    expect(isImageRenderCachePrimitive(primitive)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isImageRenderCachePrimitive(null)).toBe(false);
  });

  it('returns false for a plain object without the correct kind', () => {
    expect(isImageRenderCachePrimitive({ kind: Symbol('other') })).toBe(false);
  });
});

describe('isRenderImageCacheAdapter', () => {
  it('returns true for a valid adapter', () => {
    const adapter = createRenderImageCacheAdapter();
    expect(isRenderImageCacheAdapter(adapter)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRenderImageCacheAdapter(null)).toBe(false);
  });

  it('returns false for an object without adapt', () => {
    expect(isRenderImageCacheAdapter({ result: null })).toBe(false);
  });

  it('returns false for an object without result', () => {
    expect(isRenderImageCacheAdapter({ adapt: () => null })).toBe(false);
  });
});

describe('registerImageRenderCacheRenderer', () => {
  it('registers the renderer for the image cache kind', () => {
    const state = createRenderState();
    const renderer = { createData: () => null, draw: vi.fn() };
    registerImageRenderCacheRenderer(state, renderer as any);
    expect(state.rendererMap.get(ImageRenderCacheKind)).toBe(renderer);
  });
});

describe('setImageRenderCache', () => {
  it('creates a cache adapter and sets the result', () => {
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(obj as any, cache);
    expect(getImageRenderCache(obj as any)).toBe(cache);
  });

  it('reuses an existing adapter on subsequent calls', () => {
    const obj = createDisplayObject();
    const cache1 = makeCacheResult();
    const cache2 = makeCacheResult();
    setImageRenderCache(obj as any, cache1);
    setImageRenderCache(obj as any, cache2);
    expect(getImageRenderCache(obj as any)).toBe(cache2);
  });
});
