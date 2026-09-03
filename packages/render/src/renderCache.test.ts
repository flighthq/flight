import { createDisplayObject } from '@flighthq/scene2d/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createRenderCache,
  createRenderCacheAdapter,
  enableRenderCacheAdapterSignals,
  getRenderProxyCache,
  isRenderCache,
  isRenderCacheAdapter,
  registerRenderCacheRenderer,
  RenderCacheKind,
  useRenderCache,
} from './renderCache';
import { createRenderProxy2D } from './renderProxy';
import { getRenderProxyAdapter } from './renderProxyAdapter';
import { createRenderState, getRenderStateRuntime } from './renderState';

describe('createRenderCache', () => {
  it('creates a handle with the render cache kind and a transform', () => {
    const cache = createRenderCache();
    expect(cache.kind).toBe(RenderCacheKind);
    expect(cache.transform).toBeDefined();
  });
});

describe('createRenderCacheAdapter', () => {
  it('returns an Entity, so the adapter can carry runtime state like every other SDK object', () => {
    // Pinned on the KEY rather than on a helper: an adapter built by a plain object literal satisfies
    // the RenderCacheAdapter type and every behavioural test below, and only the missing runtime slot
    // tells it apart from one built through createEntity.
    const adapter = createRenderCacheAdapter();
    expect(EntityRuntimeKey in adapter).toBe(true);
    expect(adapter[EntityRuntimeKey]).toBeUndefined();
  });

  it('gives each adapter its own runtime slot rather than a shared one', () => {
    const first = createRenderCacheAdapter();
    const second = createRenderCacheAdapter();
    expect(Object.hasOwn(first, EntityRuntimeKey)).toBe(true);
    expect(Object.hasOwn(second, EntityRuntimeKey)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('still starts detached and still adopts the cache it was given', () => {
    expect(createRenderCacheAdapter().cache).toBeNull();
    const cache = createRenderCache();
    expect(createRenderCacheAdapter(cache).cache).toBe(cache);
    expect(createRenderCacheAdapter().signals).toBeNull();
  });
});

describe('createRenderCacheAdapter', () => {
  it('adapt returns null and renders normally when no cache is attached', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    const adapter = createRenderCacheAdapter();
    expect(adapter.adapt(state, obj, data)).toBeNull();
  });

  it('switches the render node to the cache kind and stops traversal, keeping the source node', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
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
    const data = createRenderProxy2D(state, obj);
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

describe('getRenderProxyCache', () => {
  it('returns the cache attached to a source, or null when none', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getRenderProxyCache(state, obj as any)).toBeNull();
    const cache = createRenderCache();
    useRenderCache(state, obj as any, cache);
    expect(getRenderProxyCache(state, obj as any)).toBe(cache);
  });
});

describe('isRenderCache', () => {
  it('returns true for a render cache handle', () => {
    expect(isRenderCache(createRenderCache())).toBe(true);
  });

  it('returns false for other kinds and null', () => {
    expect(isRenderCache({ kind: 'other' })).toBe(false);
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
    expect(getRegistryTableEntry(getRenderStateRuntime(state).registries.renderers, RenderCacheKind)).toBe(renderer);
  });
});

describe('useRenderCache', () => {
  it('attaches a cache adapter to the source on the state', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    const adapter = useRenderCache(state, obj as any, cache);
    expect(getRenderProxyAdapter(state, obj as any)).toBe(adapter);
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
    expect(getRenderProxyAdapter(stateB, obj as any)).toBeNull();
  });
});
import { getRegistryTableEntry } from '@flighthq/registry/contract';
