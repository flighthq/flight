import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderState, setRenderNodeAdapter } from '@flighthq/render';
import { connectSignal } from '@flighthq/signals';

import {
  createWebGLCache,
  createWebGLCacheAdapter,
  defaultWebGLCacheRenderer,
  enableWebGLCache,
  enableWebGLCacheAdapterSignals,
  WebGLCacheKind,
} from './webglCacheAdapter';

describe('createWebGLCache', () => {
  it('creates a cache with WebGLCacheKind', () => {
    const cache = createWebGLCache();
    expect(cache.kind).toBe(WebGLCacheKind);
  });

  it('creates a cache with null target', () => {
    const cache = createWebGLCache();
    expect(cache.target).toBeNull();
  });

  it('creates a cache with an identity transform', () => {
    const cache = createWebGLCache();
    expect(cache.transform.a).toBe(1);
    expect(cache.transform.d).toBe(1);
    expect(cache.transform.tx).toBe(0);
    expect(cache.transform.ty).toBe(0);
  });
});

describe('createWebGLCacheAdapter', () => {
  it('creates an adapter with null primitive and null signals', () => {
    const adapter = createWebGLCacheAdapter();
    expect(adapter.primitive).toBeNull();
    expect(adapter.signals).toBeNull();
  });

  it('adapt returns null when primitive is null', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createWebGLCacheAdapter();
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    expect(adapter.adapt(state, obj, node)).toBeNull();
  });

  it('adapt returns false and sets kind and source when primitive is set', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createWebGLCacheAdapter();
    const cache = createWebGLCache();
    adapter.primitive = cache;
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    const result = adapter.adapt(state, obj, node);
    expect(result).toBe(false);
    expect(node.kind).toBe(WebGLCacheKind);
    expect(node.source).toBe(cache);
  });

  it('adapt multiplies the cache transform into node.transform2D', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createWebGLCacheAdapter();
    const cache = createWebGLCache();
    cache.transform.tx = 10;
    cache.transform.ty = 20;
    adapter.primitive = cache;
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    adapter.adapt(state, obj, node);
    expect(node.transform2D.tx).toBe(10);
    expect(node.transform2D.ty).toBe(20);
  });

  it('adapt emits onPrepare when signals are enabled', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createWebGLCacheAdapter();
    enableWebGLCacheAdapterSignals(adapter);
    const listener = vi.fn();
    connectSignal(adapter.signals!.onPrepare, listener);
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    adapter.adapt(state, obj, node);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('enableWebGLCache', () => {
  it('registers the renderer for WebGLCacheKind', () => {
    const state = createRenderState();
    enableWebGLCache(state);
    expect(state.rendererMap.get(WebGLCacheKind)).toBe(defaultWebGLCacheRenderer);
  });
});

describe('enableWebGLCacheAdapterSignals', () => {
  it('allocates signals on the adapter', () => {
    const adapter = createWebGLCacheAdapter();
    enableWebGLCacheAdapterSignals(adapter);
    expect(adapter.signals).not.toBeNull();
    expect(typeof adapter.signals!.onPrepare.emit).toBe('function');
  });

  it('is idempotent', () => {
    const adapter = createWebGLCacheAdapter();
    enableWebGLCacheAdapterSignals(adapter);
    const first = adapter.signals;
    enableWebGLCacheAdapterSignals(adapter);
    expect(adapter.signals).toBe(first);
  });
});

describe('setRenderNodeAdapter + createWebGLCacheAdapter', () => {
  it('isolates adapters between render states', () => {
    const stateA = createRenderState();
    const stateB = createRenderState();
    const obj = createDisplayObject();
    const adapter = createWebGLCacheAdapter();
    setRenderNodeAdapter(stateA, obj, adapter);
    expect(stateA.renderNodeAdapterMap.get(obj)).toBe(adapter);
    expect(stateB.renderNodeAdapterMap.get(obj)).toBeUndefined();
  });
});
