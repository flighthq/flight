import { createMatrix } from '@flighthq/geometry/contract';
import type * as GlRenderGlModule from '@flighthq/render-gl/contract';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import type * as GlCacheModule from './glCache';
import type * as GlNode2DModule from './glNode2D';
import type * as GlQuadBatchWriterModule from './glQuadBatchWriter';
import { scopeModuleMocks } from './moduleMockTestHelper';

// The GL render-target lifecycle (@flighthq/render-gl) and the two local collaborators
// ./glQuadBatchWriter and ./glNode2D are stubbed so cache orchestration can be unit-tested
// without a real GL pipeline: createGlRenderTarget returns a plain descriptor, and the composite,
// batch-flush, and subtree-render calls become spies for the call and ordering assertions below.
// The mocks are scoped to this file's dynamic import of ./glCache and unmocked in afterAll, so under
// a shared (isolate:false) worker they never leak into the real render-gl / scene2d-gl
// consumers. The mocked functions are read back from the same dynamic imports so the handles the
// assertions observe are the exact vi.fn instances the cache module calls.
let createGlCacheState: typeof GlCacheModule.createGlCacheState;
let defaultGlRenderCacheRenderer: typeof GlCacheModule.defaultGlRenderCacheRenderer;
let enableGlRenderCache: typeof GlCacheModule.enableGlRenderCache;
let ensureGlRenderCacheTarget: typeof GlCacheModule.ensureGlRenderCacheTarget;
let getGlRenderCacheScreenState: typeof GlCacheModule.getGlRenderCacheScreenState;
let getGlRenderCacheTarget: typeof GlCacheModule.getGlRenderCacheTarget;
let refreshGlRenderCache: typeof GlCacheModule.refreshGlRenderCache;
let releaseGlRenderCache: typeof GlCacheModule.releaseGlRenderCache;
let createGlRenderStateRuntime: typeof GlRenderGlModule.createGlRenderStateRuntime;
let getGlRenderStateRuntime: typeof GlRenderGlModule.getGlRenderStateRuntime;
let destroyGlRenderTarget: typeof GlRenderGlModule.destroyGlRenderTarget;
let drawGlRenderTargetResult: typeof GlRenderGlModule.drawGlRenderTargetResult;
let renderGlScene2D: typeof GlNode2DModule.renderGlScene2D;
let flushGlQuadBatchWriter: typeof GlQuadBatchWriterModule.flushGlQuadBatchWriter;

// EntityRuntimeKey (Symbol.for) and RenderCacheKind (a string) are identity-stable across the
// registry reset scopeModuleMocks performs, and cache adapters are stored on the state, not module-
// level, so the statically-imported @flighthq/render still interoperates with the re-evaluated
// subject even though the subject re-imports @flighthq/render under the reset.
scopeModuleMocks(['./glQuadBatchWriter', '@flighthq/render-gl', './glNode2D']);

beforeAll(async () => {
  vi.doMock('./glQuadBatchWriter', async (importOriginal) => {
    const actual = await importOriginal<typeof GlQuadBatchWriterModule>();
    return { ...actual, flushGlQuadBatchWriter: vi.fn() };
  });
  vi.doMock('@flighthq/render-gl/contract', async (importOriginal) => {
    const actual = await importOriginal<typeof GlRenderGlModule>();
    return {
      ...actual,
      beginGlRenderPass: vi.fn(),
      setGlRenderTransform2D: vi.fn(),
      createGlRenderTarget: vi.fn((_state: unknown, descriptor: { width: number; height: number }): GlRenderTarget => {
        const texture = {} as WebGLTexture;
        return {
          requestedAxes: {
            width: descriptor.width,
            height: descriptor.height,
            format: 'rgba8',
            colorAttachments: 1,
            colorFormats: ['rgba8'],
            sampleCount: 1,
            depth: 'none',
            colorSpace: 'srgb',
          },
          framebuffer: {} as WebGLFramebuffer,
          resolveFramebuffer: null,
          texture,
          textures: [texture],
          depthTexture: null,
          colorRenderbuffers: [],
          depthStencilRenderbuffer: null,
          format: 'rgba8',
          colorAttachments: 1,
          colorFormats: ['rgba8'],
          depth: 'none',
          colorSpace: 'srgb',
          clearColors: [],
          clearDepth: 1,
          sampleCount: 1,
          width: descriptor.width,
          height: descriptor.height,
        };
      }),
      destroyGlRenderTarget: vi.fn(),
      drawGlRenderTargetResult: vi.fn(),
      endGlRenderPass: vi.fn(),
      resizeGlRenderTarget: vi.fn((_state: unknown, target: GlRenderTarget, width: number, height: number) => {
        target.width = width;
        target.height = height;
      }),
    };
  });
  vi.doMock('./glNode2D', async (importOriginal) => {
    const actual = await importOriginal<typeof GlNode2DModule>();
    return { ...actual, renderGlScene2D: vi.fn() };
  });

  ({ createGlRenderStateRuntime, getGlRenderStateRuntime, destroyGlRenderTarget, drawGlRenderTargetResult } =
    await import('@flighthq/render-gl/contract'));
  ({ flushGlQuadBatchWriter } = await import('./glQuadBatchWriter'));
  ({ renderGlScene2D } = await import('./glNode2D'));
  ({
    createGlCacheState,
    defaultGlRenderCacheRenderer,
    enableGlRenderCache,
    ensureGlRenderCacheTarget,
    getGlRenderCacheScreenState,
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
    expect(getGlRenderStateRuntime(cacheState).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultGlRenderCacheRenderer,
    });
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
    // The composite draws an immediate quad outside the quad-batch writer; geometry submitted earlier in
    // the walk must be drained first, or it replays after the cache result (a doubled image).
    expect(flushGlQuadBatchWriter).toHaveBeenCalledWith(state);
    expect((flushGlQuadBatchWriter as any).mock.invocationCallOrder[0]).toBeLessThan(
      (drawGlRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableGlRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableGlRenderCache(state);
    expect(getGlRenderStateRuntime(state).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultGlRenderCacheRenderer,
    });
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

describe('getGlRenderCacheScreenState', () => {
  it('resolves a cache render state to the screen state that owns shared GL resources', () => {
    const screen = fakeScreen();
    const cacheState = createGlCacheState(screen);

    expect(getGlRenderCacheScreenState(cacheState)).toBe(screen);
    expect(getGlRenderCacheScreenState(screen)).toBe(screen);
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
    expect(renderGlScene2D).toHaveBeenCalled();
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
