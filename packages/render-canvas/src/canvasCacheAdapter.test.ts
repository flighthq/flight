import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderState, setRenderNodeAdapter } from '@flighthq/render';
import { connectSignal } from '@flighthq/signals';

import {
  CanvasCacheKind,
  createCanvasCache,
  createCanvasCacheAdapter,
  defaultCanvasCacheRenderer,
  enableCanvasCache,
  enableCanvasCacheAdapterSignals,
} from './canvasCacheAdapter';
import { createCanvasRenderState } from './canvasRenderState';

function makeCanvasState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('createCanvasCache', () => {
  it('creates a cache with CanvasCacheKind', () => {
    const cache = createCanvasCache();
    expect(cache.kind).toBe(CanvasCacheKind);
  });

  it('creates a cache with null target', () => {
    const cache = createCanvasCache();
    expect(cache.target).toBeNull();
  });

  it('creates a cache with an identity transform', () => {
    const cache = createCanvasCache();
    expect(cache.transform.a).toBe(1);
    expect(cache.transform.d).toBe(1);
    expect(cache.transform.tx).toBe(0);
    expect(cache.transform.ty).toBe(0);
  });
});

describe('createCanvasCacheAdapter', () => {
  it('creates an adapter with null primitive and null signals', () => {
    const adapter = createCanvasCacheAdapter();
    expect(adapter.primitive).toBeNull();
    expect(adapter.signals).toBeNull();
  });

  it('adapt returns null when primitive is null', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createCanvasCacheAdapter();
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    expect(adapter.adapt(state, obj, node)).toBeNull();
  });

  it('adapt returns false and sets kind and source when primitive is set', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createCanvasCacheAdapter();
    const cache = createCanvasCache();
    adapter.primitive = cache;
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    const result = adapter.adapt(state, obj, node);
    expect(result).toBe(false);
    expect(node.kind).toBe(CanvasCacheKind);
    expect(node.source).toBe(cache);
  });

  it('adapt multiplies the cache transform into node.transform2D', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createCanvasCacheAdapter();
    const cache = createCanvasCache();
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
    const adapter = createCanvasCacheAdapter();
    enableCanvasCacheAdapterSignals(adapter);
    const listener = vi.fn();
    connectSignal(adapter.signals!.onPrepare, listener);
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    adapter.adapt(state, obj, node);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('adapt does not throw when signals are null', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const adapter = createCanvasCacheAdapter();
    const node = { source: obj, kind: obj.kind, transform2D: createMatrix(), traverseChildren: true } as any;
    expect(() => adapter.adapt(state, obj, node)).not.toThrow();
  });
});

describe('enableCanvasCache', () => {
  it('registers the renderer for CanvasCacheKind', () => {
    const state = makeCanvasState();
    enableCanvasCache(state);
    expect(state.rendererMap.get(CanvasCacheKind)).toBe(defaultCanvasCacheRenderer);
  });
});

describe('enableCanvasCacheAdapterSignals', () => {
  it('allocates signals on the adapter', () => {
    const adapter = createCanvasCacheAdapter();
    enableCanvasCacheAdapterSignals(adapter);
    expect(adapter.signals).not.toBeNull();
    expect(typeof adapter.signals!.onPrepare.emit).toBe('function');
  });

  it('is idempotent', () => {
    const adapter = createCanvasCacheAdapter();
    enableCanvasCacheAdapterSignals(adapter);
    const first = adapter.signals;
    enableCanvasCacheAdapterSignals(adapter);
    expect(adapter.signals).toBe(first);
  });
});

describe('setRenderNodeAdapter + createCanvasCacheAdapter', () => {
  it('isolates adapters between render states', () => {
    const stateA = makeCanvasState();
    const stateB = makeCanvasState();
    const obj = createDisplayObject();
    const adapter = createCanvasCacheAdapter();
    setRenderNodeAdapter(stateA, obj, adapter);
    expect(stateA.renderNodeAdapterMap.get(obj)).toBe(adapter);
    expect(stateB.renderNodeAdapterMap.get(obj)).toBeUndefined();
  });
});
