import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';

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
} from './imageRenderCache';
import { createDisplayObjectRenderNode } from './renderNode';
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
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(state, obj as any, cache);
    clearImageRenderCache(state, obj as any);
    expect(getImageRenderCache(state, obj as any)).toBeNull();
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

  it('adapt reuses the same primitive across calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data1 = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderImageCacheAdapter();
    adapter.result = makeCacheResult();
    adapter.adapt(state, obj, data1);
    const source1 = data1.source;

    const data2 = createDisplayObjectRenderNode(state, obj);
    adapter.adapt(state, obj, data2);
    expect(data2.source).toBe(source1);
  });

  it('returns an object with an adapt method and result field', () => {
    const adapter = createRenderImageCacheAdapter();
    expect(typeof adapter.adapt).toBe('function');
    expect('result' in adapter).toBe(true);
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
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getImageRenderCache(state, obj as any)).toBeNull();
  });

  it('returns the cache result after setImageRenderCache', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(state, obj as any, cache);
    expect(getImageRenderCache(state, obj as any)).toBe(cache);
  });
});

describe('isImageRenderCachePrimitive', () => {
  it('returns false for a plain object without the correct kind', () => {
    expect(isImageRenderCachePrimitive({ kind: Symbol('other') })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isImageRenderCachePrimitive(null)).toBe(false);
  });

  it('returns true for a valid primitive', () => {
    const owner = createDisplayObject();
    const primitive = createImageRenderCachePrimitive(owner, makeCacheResult());
    expect(isImageRenderCachePrimitive(primitive)).toBe(true);
  });
});

describe('isRenderImageCacheAdapter', () => {
  it('returns false for an object without adapt', () => {
    expect(isRenderImageCacheAdapter({ result: null })).toBe(false);
  });

  it('returns false for an object without result', () => {
    expect(isRenderImageCacheAdapter({ adapt: () => null })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRenderImageCacheAdapter(null)).toBe(false);
  });

  it('returns true for a valid adapter', () => {
    const adapter = createRenderImageCacheAdapter();
    expect(isRenderImageCacheAdapter(adapter)).toBe(true);
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
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(state, obj as any, cache);
    expect(getImageRenderCache(state, obj as any)).toBe(cache);
  });

  it('reuses an existing adapter on subsequent calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache1 = makeCacheResult();
    const cache2 = makeCacheResult();
    setImageRenderCache(state, obj as any, cache1);
    setImageRenderCache(state, obj as any, cache2);
    expect(getImageRenderCache(state, obj as any)).toBe(cache2);
  });

  it('isolates cache between render states', () => {
    const stateA = createRenderState();
    const stateB = createRenderState();
    const obj = createDisplayObject();
    const cache = makeCacheResult();
    setImageRenderCache(stateA, obj as any, cache);
    expect(getImageRenderCache(stateA, obj as any)).toBe(cache);
    expect(getImageRenderCache(stateB, obj as any)).toBeNull();
  });
});
