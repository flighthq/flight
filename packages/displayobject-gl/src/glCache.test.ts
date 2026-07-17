import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render';
import type * as GlRenderGlModule from '@flighthq/render-gl';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type * as GlCacheModule from './glCache';
import type * as GlDisplayObjectModule from './glDisplayObject';
import type * as GlSpriteBatchModule from './glSpriteBatch';
import { scopeModuleMocks } from './moduleMockTestHelper';

// The GL render-target lifecycle (@flighthq/render-gl) and the two local collaborators
// ./glSpriteBatch and ./glDisplayObject are stubbed so cache orchestration can be unit-tested
// without a real GL pipeline: createGlRenderTarget returns a plain descriptor, and the composite,
// batch-flush, and subtree-render calls become spies for the call and ordering assertions below.
// The mocks are scoped to this file's dynamic import of ./glCache and unmocked in afterAll, so under
// a shared (isolate:false) worker they never leak into the real render-gl / displayobject-gl
// consumers. The mocked functions are read back from the same dynamic imports so the handles the
// assertions observe are the exact vi.fn instances the cache module calls.
let createGlCacheState: typeof GlCacheModule.createGlCacheState;
let defaultGlRenderCacheRenderer: typeof GlCacheModule.defaultGlRenderCacheRenderer;
let enableGlRenderCache: typeof GlCacheModule.enableGlRenderCache;
let ensureGlRenderCacheTarget: typeof GlCacheModule.ensureGlRenderCacheTarget;
let getGlRenderCacheTarget: typeof GlCacheModule.getGlRenderCacheTarget;
let refreshGlRenderCache: typeof GlCacheModule.refreshGlRenderCache;
let releaseGlRenderCache: typeof GlCacheModule.releaseGlRenderCache;
let createGlRenderStateRuntime: typeof GlRenderGlModule.createGlRenderStateRuntime;
let getGlRenderStateRuntime: typeof GlRenderGlModule.getGlRenderStateRuntime;
let destroyGlRenderTarget: typeof GlRenderGlModule.destroyGlRenderTarget;
let drawGlRenderTargetResult: typeof GlRenderGlModule.drawGlRenderTargetResult;
let renderGlDisplayObject: typeof GlDisplayObjectModule.renderGlDisplayObject;
let flushGlSpriteBatch: typeof GlSpriteBatchModule.flushGlSpriteBatch;

// EntityRuntimeKey (Symbol.for) and RenderCacheKind (a string) are identity-stable across the
// registry reset scopeModuleMocks performs, and cache adapters are stored on the state, not module-
// level, so the statically-imported @flighthq/render still interoperates with the re-evaluated
// subject even though the subject re-imports @flighthq/render under the reset.
scopeModuleMocks(['./glSpriteBatch', '@flighthq/render-gl', './glDisplayObject']);

beforeAll(async () => {
  vi.doMock('./glSpriteBatch', async (importOriginal) => {
    const actual = await importOriginal<typeof GlSpriteBatchModule>();
    return { ...actual, flushGlSpriteBatch: vi.fn() };
  });
  vi.doMock('@flighthq/render-gl', async (importOriginal) => {
    const actual = await importOriginal<typeof GlRenderGlModule>();
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
          colorSpace: 'srgb',
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
  vi.doMock('./glDisplayObject', async (importOriginal) => {
    const actual = await importOriginal<typeof GlDisplayObjectModule>();
    return { ...actual, renderGlDisplayObject: vi.fn() };
  });

  ({ createGlRenderStateRuntime, getGlRenderStateRuntime, destroyGlRenderTarget, drawGlRenderTargetResult } =
    await import('@flighthq/render-gl'));
  ({ flushGlSpriteBatch } = await import('./glSpriteBatch'));
  ({ renderGlDisplayObject } = await import('./glDisplayObject'));
  ({
    createGlCacheState,
    defaultGlRenderCacheRenderer,
    enableGlRenderCache,
    ensureGlRenderCacheTarget,
    getGlRenderCacheTarget,
    refreshGlRenderCache,
    releaseGlRenderCache,
  } = await import('./glCache'));
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
