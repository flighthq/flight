import { createMatrix } from '@flighthq/geometry/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createRenderCache, getRenderProxy2D, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import {
  createCanvasCacheState,
  createCanvasOffscreenRenderState,
  defaultCanvasRenderCacheRenderer,
  destroyCanvasRenderCacheTarget,
  enableCanvasRenderCache,
  ensureCanvasRenderCacheTarget,
  getCanvasRenderCacheTarget,
  refreshCanvasRenderCache,
  releaseCanvasRenderCache,
} from './canvasCache';
import {
  acquireTestCanvasRenderSurface,
  createCanvasRenderState,
  createCanvasTextureResolvers,
  destroyCanvasRenderState,
  getCanvasRenderStateRuntime,
} from './canvasTestSupport';

function makeCanvasState(options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas, options);
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

function makeCacheState(ownerState: ReturnType<typeof makeCanvasState>, options = {}) {
  const ownerRuntime = getCanvasRenderStateRuntime(ownerState);
  return createCanvasCacheState(
    ownerState,
    acquireTestCanvasRenderSurface(),
    ownerState.pipeline,
    createCanvasTextureResolvers(),
    {
      backgroundColor: ownerState.backgroundColor,
      imageSmoothingEnabled: ownerRuntime.imageSmoothingEnabled,
      imageSmoothingQuality: ownerRuntime.imageSmoothingQuality,
      pixelRatio: ownerState.pixelRatio,
      roundPixels: ownerState.roundPixels,
      sceneGraphSyncPolicy: ownerState.sceneGraphSyncPolicy,
      ...options,
    },
  );
}

function makeOffscreenState(ownerState: ReturnType<typeof makeCanvasState>, options = {}) {
  return createCanvasOffscreenRenderState(
    acquireTestCanvasRenderSurface(),
    ownerState.pipeline,
    createCanvasTextureResolvers(),
    options,
  );
}

describe('createCanvasCacheState', () => {
  it('copies the screen state renderers', () => {
    const screen = makeCanvasState();
    enableCanvasRenderCache(screen);
    const cacheState = makeCacheState(screen);
    expect(getRegistryTableEntry(getCanvasRenderStateRuntime(cacheState).registries.renderers, RenderCacheKind)).toBe(
      defaultCanvasRenderCacheRenderer,
    );
  });

  it('propagates pixel ratio and scene graph sync policy without sharing node maps', () => {
    const screen = makeCanvasState({ pixelRatio: 3, sceneGraphSyncPolicy: 'refreshDerivedState' });
    const cacheState = makeCacheState(screen);
    expect(cacheState.pixelRatio).toBe(3);
    expect(cacheState.sceneGraphSyncPolicy).toBe('refreshDerivedState');
    expect(getCanvasRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      getCanvasRenderStateRuntime(screen).renderProxyMap,
    );
  });

  it('takes immutable registration policy from the explicit pipeline', () => {
    const screen = makeCanvasState();
    const screenRuntime = getCanvasRenderStateRuntime(screen);
    const cacheState = makeCacheState(screen);
    const cacheRuntime = getCanvasRenderStateRuntime(cacheState);

    expect(cacheState.pipeline).toBe(screen.pipeline);
    expect(cacheRuntime.registries).not.toBe(screenRuntime.registries);
    expect(cacheRuntime.registries.renderEffects).toBe(screenRuntime.registries.renderEffects);
  });

  it('releases the cache state and every target with its explicit owner', () => {
    const screen = makeCanvasState();
    const cacheState = makeCacheState(screen);
    const target = ensureCanvasRenderCacheTarget(screen, createRenderCache(), 16, 24);

    destroyCanvasRenderState(screen);

    expect(cacheState.canvas.width).toBe(0);
    expect(cacheState.canvas.height).toBe(0);
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });
});

describe('createCanvasOffscreenRenderState', () => {
  it('does not reach ambient document state during construction', () => {
    const screen = makeCanvasState();
    const surface = acquireTestCanvasRenderSurface();
    const resolvers = createCanvasTextureResolvers();
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });

    try {
      expect(() => createCanvasOffscreenRenderState(surface, screen.pipeline, resolvers)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'document', documentDescriptor);
    }
  });

  it('releases the owned backing store when destroyed', () => {
    const screen = makeCanvasState();
    const offscreen = makeOffscreenState(screen);
    offscreen.canvas.width = 17;
    offscreen.canvas.height = 19;

    destroyCanvasRenderState(offscreen);

    expect(offscreen.canvas.width).toBe(0);
    expect(offscreen.canvas.height).toBe(0);
  });

  it('creates an independent host canvas without a hidden owner link', () => {
    const screen = makeCanvasState();
    const offscreen = makeOffscreenState(screen);
    expect(offscreen.canvas).not.toBe(screen.canvas);
    expect(getCanvasRenderCacheTarget(offscreen, createRenderCache())).toBeNull();
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
    const cacheState = makeCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshCanvasRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    const target = getCanvasRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
    expect(target!.height).toBe(10);
  });

  it('always rebakes under the refreshDerivedState policy', () => {
    const screen = makeCanvasState({ sceneGraphSyncPolicy: 'refreshDerivedState' });
    const cacheState = makeCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(refreshCanvasRenderCache(screen, cacheState, cache, obj, { padding: 5 })).toBe(true);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = makeCanvasState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = makeCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(refreshCanvasRenderCache(screen, cacheState, cache, obj, { padding: 5 })).toBe(false);
  });

  it('does not create render nodes on the screen state', () => {
    const screen = makeCanvasState();
    const cacheState = makeCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshCanvasRenderCache(screen, cacheState, cache, obj);
    expect(getRenderProxy2D(screen, obj)).toBeUndefined();
  });
});

describe('releaseCanvasRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = makeCanvasState();
    const cache = createRenderCache();
    const target = ensureCanvasRenderCacheTarget(state, cache, 8, 8);
    releaseCanvasRenderCache(state, cache);
    expect(getCanvasRenderCacheTarget(state, cache)).toBeNull();
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });
});
