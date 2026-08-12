import { createMatrix } from '@flighthq/geometry/contract';
import { getRegistryTableEntry, hasRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createRenderCache, getRenderProxy2D, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import {
  createCanvasCacheState,
  createCanvasOffscreenRenderState,
  defaultCanvasRenderCacheRenderer,
  destroyCanvasRenderCacheTarget,
  enableCanvasRenderCache,
  ensureCanvasRenderCacheTarget,
  getCanvasRenderCacheScreenState,
  getCanvasRenderCacheTarget,
  refreshCanvasRenderCache,
  releaseCanvasRenderCache,
} from './canvasCache';
import {
  copyCanvasRenderStateRegistrations,
  createCanvasRenderState,
  getCanvasRenderStateRuntime,
} from './canvasRenderState';

function makeCanvasState(options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas, options);
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createCanvasCacheState', () => {
  it('copies the screen state renderers', () => {
    const screen = makeCanvasState();
    enableCanvasRenderCache(screen);
    const cacheState = createCanvasCacheState(screen);
    expect(getRegistryTableEntry(getCanvasRenderStateRuntime(cacheState).registries.renderers, RenderCacheKind)).toBe(
      defaultCanvasRenderCacheRenderer,
    );
  });

  it('propagates pixel ratio and scene graph sync policy without sharing node maps', () => {
    const screen = makeCanvasState({ pixelRatio: 3, sceneGraphSyncPolicy: 'refreshDerivedState' });
    const cacheState = createCanvasCacheState(screen);
    expect(cacheState.pixelRatio).toBe(3);
    expect(cacheState.sceneGraphSyncPolicy).toBe('refreshDerivedState');
    expect(getCanvasRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      getCanvasRenderStateRuntime(screen).renderProxyMap,
    );
  });

  it('snapshots registration policy and requires explicit re-copy for later entries', () => {
    const screen = makeCanvasState();
    const screenRuntime = getCanvasRenderStateRuntime(screen);
    const firstRunner = vi.fn();
    const laterRunner = vi.fn();
    screenRuntime.registries.renderEffects = withRegistryTableEntry(
      screenRuntime.registries.renderEffects,
      'acme.First',
      firstRunner as never,
    );
    const cacheState = createCanvasCacheState(screen);
    const cacheRuntime = getCanvasRenderStateRuntime(cacheState);

    expect(cacheRuntime.registries).not.toBe(screenRuntime.registries);
    expect(cacheRuntime.registries.renderEffects).toBe(screenRuntime.registries.renderEffects);
    expect(getRegistryTableEntry(cacheRuntime.registries.renderEffects, 'acme.First')).toBe(firstRunner);

    screenRuntime.registries.renderEffects = withRegistryTableEntry(
      screenRuntime.registries.renderEffects,
      'acme.Later',
      laterRunner as never,
    );
    expect(hasRegistryTableEntry(cacheRuntime.registries.renderEffects, 'acme.Later')).toBe(false);

    copyCanvasRenderStateRegistrations(cacheState, screen);
    expect(getRegistryTableEntry(cacheRuntime.registries.renderEffects, 'acme.Later')).toBe(laterRunner);
  });
});

describe('createCanvasOffscreenRenderState', () => {
  it('creates an independent host canvas linked to the screen target owner', () => {
    const screen = makeCanvasState();
    const offscreen = createCanvasOffscreenRenderState(screen);
    expect(offscreen.canvas).not.toBe(screen.canvas);
    expect(getCanvasRenderCacheScreenState(offscreen)).toBe(screen);
  });
});

describe('defaultCanvasRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = makeCanvasState();
    const spy = vi.spyOn(state.context, 'drawImage');
    defaultCanvasRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws the cache target attached to the source node', () => {
    const state = makeCanvasState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureCanvasRenderCacheTarget(state, cache, 16, 16);
    const spy = vi.spyOn(state.context, 'drawImage');
    defaultCanvasRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(spy).toHaveBeenCalledWith(target.canvas, 0, 0);
  });
});

describe('destroyCanvasRenderCacheTarget', () => {
  it('collapses the canvas to zero size and removes the target', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    const target = ensureCanvasRenderCacheTarget(state, cache, 8, 8);
    destroyCanvasRenderCacheTarget(state, cache);
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
    expect(target.width).toBe(0);
    expect(target.height).toBe(0);
    expect(getCanvasRenderCacheTarget(state, cache)).toBeNull();
  });

  it('is a no-op when the target does not exist', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    expect(() => destroyCanvasRenderCacheTarget(state, cache)).not.toThrow();
  });
});

describe('enableCanvasRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = makeCanvasState();
    enableCanvasRenderCache(state);
    expect(getRegistryTableEntry(getCanvasRenderStateRuntime(state).registries.renderers, RenderCacheKind)).toBe(
      defaultCanvasRenderCacheRenderer,
    );
  });
});

describe('ensureCanvasRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    const target = ensureCanvasRenderCacheTarget(state, cache, 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    const first = ensureCanvasRenderCacheTarget(state, cache, 64, 32);
    const second = ensureCanvasRenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = makeCanvasState();
    const stateB = makeCanvasState();
    const cache = createRenderCache();
    const targetA = ensureCanvasRenderCacheTarget(stateA, cache, 8, 8);
    const targetB = ensureCanvasRenderCacheTarget(stateB, cache, 8, 8);
    expect(targetA).not.toBe(targetB);
  });
});

describe('getCanvasRenderCacheScreenState', () => {
  it('resolves a cache render state to the screen state that owns shared targets', () => {
    const screen = makeCanvasState();
    const cacheState = createCanvasCacheState(screen);

    expect(getCanvasRenderCacheScreenState(cacheState)).toBe(screen);
    expect(getCanvasRenderCacheScreenState(screen)).toBe(screen);
  });
});

describe('getCanvasRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    const state = makeCanvasState();
    expect(getCanvasRenderCacheTarget(state, createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    const target = ensureCanvasRenderCacheTarget(state, cache, 8, 8);
    expect(getCanvasRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('refreshCanvasRenderCache', () => {
  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = makeCanvasState();
    const cacheState = createCanvasCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshCanvasRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    const target = getCanvasRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
    expect(target!.height).toBe(10);
  });

  it('always rebakes under the refreshDerivedState policy', () => {
    const screen = makeCanvasState({ sceneGraphSyncPolicy: 'refreshDerivedState' });
    const cacheState = createCanvasCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshCanvasRenderCache(cacheState, cache, obj, { padding: 5 })).toBe(true);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = makeCanvasState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createCanvasCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshCanvasRenderCache(cacheState, cache, obj, { padding: 5 })).toBe(false);
  });

  it('does not create render nodes on the screen state', () => {
    const screen = makeCanvasState();
    const cacheState = createCanvasCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(cacheState, cache, obj);
    expect(getRenderProxy2D(screen, obj)).toBeUndefined();
  });
});

describe('releaseCanvasRenderCache', () => {
  it('drops the target for the cache', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    ensureCanvasRenderCacheTarget(state, cache, 8, 8);
    releaseCanvasRenderCache(state, cache);
    expect(getCanvasRenderCacheTarget(state, cache)).toBeNull();
  });
});
