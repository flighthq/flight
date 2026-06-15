import { createDisplayObject } from '@flighthq/displayobject';
import { connectSignal } from '@flighthq/signals';

import {
  createRenderCache,
  createRenderCacheAdapter,
  enableRenderCacheAdapterSignals,
  getRenderNodeCache,
  isRenderCache,
  isRenderCacheAdapter,
  registerRenderCacheRenderer,
  RenderCacheKind,
  useRenderCache,
} from './renderCache';
import { createDisplayObjectRenderNode } from './renderNode';
import { getRenderNodeAdapter } from './renderNodeAdapter';
import { createRenderState } from './renderState';

describe('createRenderCache', () => {
  it('creates a handle with the render cache kind and a transform', () => {
    const cache = createRenderCache();
    expect(cache.kind).toBe(RenderCacheKind);
    expect(cache.transform).toBeDefined();
  });
});

describe('createRenderCacheAdapter', () => {
  it('adapt returns null and renders normally when no cache is attached', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderCacheAdapter();
    expect(adapter.adapt(state, obj, data)).toBeNull();
  });

  it('switches the render node to the cache kind and stops traversal, keeping the source node', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const cache = createRenderCache();
    cache.transform.tx = 7;
    const adapter = createRenderCacheAdapter(cache);
    const result = adapter.adapt(state, obj, data);
    expect(result).toBe(false);
    expect(data.kind).toBe(RenderCacheKind);
    // Source stays the original node so the appearance/transform passes keep working each frame.
    expect(data.source).toBe(obj);
    expect(data.transform2D.tx).toBe(7);
  });

  it('emits onPrepare when signals are enabled', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    const adapter = createRenderCacheAdapter();
    enableRenderCacheAdapterSignals(adapter);
    const listener = vi.fn();
    connectSignal(adapter.signals!.onPrepare, listener);
    adapter.adapt(state, obj, data);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('enableRenderCacheAdapterSignals', () => {
  it('allocates the onPrepare signal', () => {
    const adapter = createRenderCacheAdapter();
    expect(adapter.signals).toBeNull();
    enableRenderCacheAdapterSignals(adapter);
    expect(adapter.signals).not.toBeNull();
  });

  it('is idempotent', () => {
    const adapter = createRenderCacheAdapter();
    enableRenderCacheAdapterSignals(adapter);
    const signals = adapter.signals;
    enableRenderCacheAdapterSignals(adapter);
    expect(adapter.signals).toBe(signals);
  });
});

describe('getRenderNodeCache', () => {
  it('returns the cache attached to a source, or null when none', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getRenderNodeCache(state, obj as any)).toBeNull();
    const cache = createRenderCache();
    useRenderCache(state, obj as any, cache);
    expect(getRenderNodeCache(state, obj as any)).toBe(cache);
  });
});

describe('isRenderCache', () => {
  it('returns true for a render cache handle', () => {
    expect(isRenderCache(createRenderCache())).toBe(true);
  });

  it('returns false for other kinds and null', () => {
    expect(isRenderCache({ kind: Symbol('other') })).toBe(false);
    expect(isRenderCache(null)).toBe(false);
  });
});

describe('isRenderCacheAdapter', () => {
  it('returns true for a render cache adapter', () => {
    expect(isRenderCacheAdapter(createRenderCacheAdapter())).toBe(true);
  });

  it('returns false for objects missing adapt or cache, and null', () => {
    expect(isRenderCacheAdapter({ cache: null })).toBe(false);
    expect(isRenderCacheAdapter({ adapt: () => null })).toBe(false);
    expect(isRenderCacheAdapter(null)).toBe(false);
  });
});

describe('registerRenderCacheRenderer', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = createRenderState();
    const renderer = { createData: () => null, submit: vi.fn() };
    registerRenderCacheRenderer(state, renderer as any);
    expect(state.rendererMap.get(RenderCacheKind)).toBe(renderer);
  });
});

describe('useRenderCache', () => {
  it('attaches a cache adapter to the source on the state', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    const adapter = useRenderCache(state, obj as any, cache);
    expect(getRenderNodeAdapter(state, obj as any)).toBe(adapter);
    expect(adapter.cache).toBe(cache);
  });

  it('reuses an existing cache adapter and swaps the handle', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const first = useRenderCache(state, obj as any, createRenderCache());
    const second = createRenderCache();
    const adapter = useRenderCache(state, obj as any, second);
    expect(adapter).toBe(first);
    expect(adapter.cache).toBe(second);
  });

  it('isolates attachment between render states', () => {
    const stateA = createRenderState();
    const stateB = createRenderState();
    const obj = createDisplayObject();
    useRenderCache(stateA, obj as any, createRenderCache());
    expect(getRenderNodeAdapter(stateB, obj as any)).toBeNull();
  });
});
