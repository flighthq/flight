import { createMatrix } from '@flighthq/geometry/contract';
import { createRenderCache, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import {
  createCanvasSurfaceFromNativeHandle,
  destroyCanvasSurface,
  getSurfaceHandle,
} from '@flighthq/surface/contract';
import type { HostCanvasCapability } from '@flighthq/types/contract';

import {
  domRenderCacheRenderer,
  enableDomRenderCache,
  ensureDomRenderCacheTarget,
  getDomRenderCacheTarget,
  releaseDomRenderCache,
} from './domCache.ts';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState.ts';

function makeState() {
  return createDomRenderState(document.createElement('div'));
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('domRenderCacheRenderer', () => {
  it('is a no-op when no cache is attached to the source', () => {
    const state = makeState();
    expect(() => domRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()))).not.toThrow();
  });

  it('places the target canvas attached to the source node', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureDomRenderCacheTarget(canvasHost, state, cache, 16, 16);
    domRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(target.canvas.style.transform).not.toBe('');
  });
});

describe('enableDomRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = makeState();
    enableDomRenderCache(state);
    expect(getDomRenderStateRuntime(state).registries.nodeRenderers.get(RenderCacheKind)).toBe(domRenderCacheRenderer);
  });
});

describe('ensureDomRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = makeState();
    const target = ensureDomRenderCacheTarget(canvasHost, state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = makeState();
    const cache = createRenderCache();
    const first = ensureDomRenderCacheTarget(canvasHost, state, cache, 64, 32);
    const second = ensureDomRenderCacheTarget(canvasHost, state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = makeState();
    const stateB = makeState();
    const cache = createRenderCache();
    expect(ensureDomRenderCacheTarget(canvasHost, stateA, cache, 8, 8)).not.toBe(
      ensureDomRenderCacheTarget(canvasHost, stateB, cache, 8, 8),
    );
  });
});

describe('getDomRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getDomRenderCacheTarget(makeState(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = makeState();
    const cache = createRenderCache();
    const target = ensureDomRenderCacheTarget(canvasHost, state, cache, 8, 8);
    expect(getDomRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('releaseDomRenderCache', () => {
  it('drops the target for the cache', () => {
    const state = makeState();
    const cache = createRenderCache();
    const target = ensureDomRenderCacheTarget(canvasHost, state, cache, 8, 8);
    releaseDomRenderCache(state, cache);
    expect(getDomRenderCacheTarget(state, cache)).toBeNull();
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });
});

const canvasHost: HostCanvasCapability = {
  acquire(surface, options) {
    const handle = getSurfaceHandle(surface) as HTMLCanvasElement;
    return handle.getContext('2d', options);
  },
  create(_win, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  createSurface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return createCanvasSurfaceFromNativeHandle(canvasHost, canvas);
  },
  destroySurface(surface) {
    const canvas = getSurfaceHandle(surface) as HTMLCanvasElement;
    destroyCanvasSurface(canvasHost, surface);
    canvas.width = 0;
    canvas.height = 0;
  },
  release() {},
};
