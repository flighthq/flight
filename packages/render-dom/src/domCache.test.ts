import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, RenderCacheKind, useRenderCache } from '@flighthq/render';

import {
  defaultDOMRenderCacheRenderer,
  enableDOMRenderCache,
  ensureDOMRenderCacheTarget,
  getDOMRenderCacheTarget,
  releaseDOMRenderCache,
} from './domCache';
import { createDOMRenderState, getDOMRenderStateRuntime } from './domRenderState';

function makeState() {
  return createDOMRenderState(document.createElement('div'));
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('defaultDOMRenderCacheRenderer', () => {
  it('is a no-op when no cache is attached to the source', () => {
    const state = makeState();
    expect(() => defaultDOMRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()))).not.toThrow();
  });

  it('places the target canvas attached to the source node', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureDOMRenderCacheTarget(state, cache, 16, 16);
    defaultDOMRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(target.canvas.style.transform).not.toBe('');
  });
});

describe('enableDOMRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = makeState();
    enableDOMRenderCache(state);
    expect(getDOMRenderStateRuntime(state).rendererMap.get(RenderCacheKind)).toBe(defaultDOMRenderCacheRenderer);
  });
});

describe('ensureDOMRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = makeState();
    const target = ensureDOMRenderCacheTarget(state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = makeState();
    const cache = createRenderCache();
    const first = ensureDOMRenderCacheTarget(state, cache, 64, 32);
    const second = ensureDOMRenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = makeState();
    const stateB = makeState();
    const cache = createRenderCache();
    expect(ensureDOMRenderCacheTarget(stateA, cache, 8, 8)).not.toBe(ensureDOMRenderCacheTarget(stateB, cache, 8, 8));
  });
});

describe('getDOMRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getDOMRenderCacheTarget(makeState(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = makeState();
    const cache = createRenderCache();
    const target = ensureDOMRenderCacheTarget(state, cache, 8, 8);
    expect(getDOMRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('releaseDOMRenderCache', () => {
  it('drops the target for the cache', () => {
    const state = makeState();
    const cache = createRenderCache();
    ensureDOMRenderCacheTarget(state, cache, 8, 8);
    releaseDOMRenderCache(state, cache);
    expect(getDOMRenderCacheTarget(state, cache)).toBeNull();
  });
});
