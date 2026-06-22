import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render';
import type * as GlRenderTargetModule from '@flighthq/render-gl';
import { createGlRenderStateRuntime, getGlRenderStateRuntime } from '@flighthq/render-gl';
import { destroyGlRenderTarget, drawGlRenderTargetResult } from '@flighthq/render-gl';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import {
  createGlCacheState,
  defaultGlRenderCacheRenderer,
  enableGlRenderCache,
  ensureGlRenderCacheTarget,
  getGlRenderCacheTarget,
  refreshGlRenderCache,
  releaseGlRenderCache,
} from './webglCache';
import type * as GlDisplayObjectModule from './webglDisplayObject';
import { renderGlDisplayObject } from './webglDisplayObject';
import type * as GlSpriteBatchModule from './webglSpriteBatch';
import { flushGlSpriteBatch } from './webglSpriteBatch';

vi.mock('./webglSpriteBatch', async (importOriginal) => {
  const actual = await importOriginal<typeof GlSpriteBatchModule>();
  return { ...actual, flushGlSpriteBatch: vi.fn() };
});

vi.mock('@flighthq/render-gl', async (importOriginal) => {
  const actual = await importOriginal<typeof GlRenderTargetModule>();
  return {
    ...actual,
    beginGlRenderTarget: vi.fn(),
    createGlRenderTarget: vi.fn((_state: unknown, descriptor: { width: number; height: number }): GlRenderTarget => {
      const texture = {} as WebGLTexture;
      return {
        framebuffer: {} as WebGLFramebuffer,
        resolveFramebuffer: null,
        texture,
        textures: [texture],
        depthTexture: null,
        colorRenderbuffers: [],
        depthStencilRenderbuffer: null,
        format: 'rgba8',
        sampleCount: 1,
        width: descriptor.width,
        height: descriptor.height,
      };
    }),
    destroyGlRenderTarget: vi.fn(),
    drawGlRenderTargetResult: vi.fn(),
    endGlRenderTarget: vi.fn(),
    resizeGlRenderTarget: vi.fn((_state: unknown, target: GlRenderTarget, width: number, height: number) => {
      target.width = width;
      target.height = height;
    }),
  };
});

vi.mock('./webglDisplayObject', async (importOriginal) => {
  const actual = await importOriginal<typeof GlDisplayObjectModule>();
  return { ...actual, renderGlDisplayObject: vi.fn() };
});

function fakeScreen(options = {}): GlRenderState {
  const state = createRenderState(options) as unknown as GlRenderState;
  (state as any).gl = { clear: vi.fn(), clearColor: vi.fn(), COLOR_BUFFER_BIT: 0x4000 };
  state[EntityRuntimeKey] = createGlRenderStateRuntime();
  return state;
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createGlCacheState', () => {
  it('copies renderers and shares the GL context but keeps its own node map', () => {
    const screen = fakeScreen();
    enableGlRenderCache(screen);
    const cacheState = createGlCacheState(screen);
    expect(getGlRenderStateRuntime(cacheState).rendererMap.get(RenderCacheKind)).toBe(defaultGlRenderCacheRenderer);
    expect((cacheState as any).gl).toBe((screen as any).gl);
    expect(getGlRenderStateRuntime(cacheState).renderProxyMap).not.toBe(getGlRenderStateRuntime(screen).renderProxyMap);
  });
});

describe('defaultGlRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultGlRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(drawGlRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureGlRenderCacheTarget(state, cache, 16, 16);
    defaultGlRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(drawGlRenderTargetResult).toHaveBeenCalledWith(state, expect.anything(), target, expect.anything());
  });

  it('flushes pending batched geometry before the immediate composite', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    ensureGlRenderCacheTarget(state, cache, 16, 16);
    defaultGlRenderCacheRenderer.submit(state, makeCacheNode(obj));
    // The composite draws an immediate quad outside the sprite batch; geometry submitted earlier in
    // the walk must be drained first, or it replays after the cache result (a doubled image).
    expect(flushGlSpriteBatch).toHaveBeenCalledWith(state);
    expect((flushGlSpriteBatch as any).mock.invocationCallOrder[0]).toBeLessThan(
      (drawGlRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableGlRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableGlRenderCache(state);
    expect(getGlRenderStateRuntime(state).rendererMap.get(RenderCacheKind)).toBe(defaultGlRenderCacheRenderer);
  });
});

describe('ensureGlRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = fakeScreen();
    const target = ensureGlRenderCacheTarget(state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const first = ensureGlRenderCacheTarget(state, cache, 64, 32);
    const second = ensureGlRenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = fakeScreen();
    const stateB = fakeScreen();
    const cache = createRenderCache();
    expect(ensureGlRenderCacheTarget(stateA, cache, 8, 8)).not.toBe(ensureGlRenderCacheTarget(stateB, cache, 8, 8));
  });
});

describe('getGlRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getGlRenderCacheTarget(fakeScreen(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureGlRenderCacheTarget(state, cache, 8, 8);
    expect(getGlRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('refreshGlRenderCache', () => {
  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createGlCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshGlRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(renderGlDisplayObject).toHaveBeenCalled();
    const target = getGlRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createGlCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshGlRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshGlRenderCache(cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseGlRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureGlRenderCacheTarget(state, cache, 8, 8);
    releaseGlRenderCache(state, cache);
    expect(destroyGlRenderTarget).toHaveBeenCalledWith(state, target);
    expect(getGlRenderCacheTarget(state, cache)).toBeNull();
  });
});
