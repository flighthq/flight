import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { createRenderCache, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { CanvasRenderSurfaceCreator } from '@flighthq/types/contract';

import {
  defaultDomRenderCacheRenderer,
  enableDomRenderCache,
  ensureDomRenderCacheTarget,
  getDomRenderCacheTarget,
  releaseDomRenderCache,
} from './domCache';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';

function makeState() {
  return createDomRenderState(document.createElement('div'));
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('defaultDomRenderCacheRenderer', () => {
  it('is a no-op when no cache is attached to the source', () => {
    const state = makeState();
    expect(() => defaultDomRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()))).not.toThrow();
  });

  it('places the target canvas attached to the source node', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, cache, 16, 16);
    defaultDomRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(target.canvas.style.transform).not.toBe('');
  });
});

describe('enableDomRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = makeState();
    enableDomRenderCache(state);
    expect(getDomRenderStateRuntime(state).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultDomRenderCacheRenderer,
    });
  });
});

describe('ensureDomRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = makeState();
    const target = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = makeState();
    const cache = createRenderCache();
    const first = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, cache, 64, 32);
    const second = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = makeState();
    const stateB = makeState();
    const cache = createRenderCache();
    expect(ensureDomRenderCacheTarget(canvasSurfaceCreator, stateA, cache, 8, 8)).not.toBe(
      ensureDomRenderCacheTarget(canvasSurfaceCreator, stateB, cache, 8, 8),
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
    const target = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, cache, 8, 8);
    expect(getDomRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('releaseDomRenderCache', () => {
  it('drops the target for the cache', () => {
    const state = makeState();
    const cache = createRenderCache();
    const target = ensureDomRenderCacheTarget(canvasSurfaceCreator, state, cache, 8, 8);
    releaseDomRenderCache(state, cache);
    expect(getDomRenderCacheTarget(state, cache)).toBeNull();
    expect(target.canvas.width).toBe(0);
    expect(target.canvas.height).toBe(0);
  });
});

const canvasSurfaceCreator = (() => {
  const out = allocateEntity<any>();
  out.createRenderSurface = (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
  out.destroyRenderSurface = (canvas: HTMLCanvasElement): void => {
    canvas.width = 0;
    canvas.height = 0;
  };
  return finishEntity(out);
})();
