import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import {
  createWebGPUCacheState,
  defaultWebGPURenderCacheRenderer,
  enableWebGPURenderCache,
  ensureWebGPURenderCacheTarget,
  getWebGPURenderCacheTarget,
  refreshWebGPURenderCache,
  releaseWebGPURenderCache,
} from './webgpuCache';
import type * as WebGPUDisplayObjectModule from './webgpuDisplayObject';
import { renderWebGPUDisplayObject } from './webgpuDisplayObject';
import { createWebGPURenderStateRuntime, getWebGPURenderStateRuntime } from './webgpuRenderState';
import type * as WebGPURenderTargetModule from './webgpuRenderTarget';
import { destroyWebGPURenderTarget, drawWebGPURenderTargetResult } from './webgpuRenderTarget';
import type * as WebGPUSpriteBatchModule from './webgpuSpriteBatch';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

vi.mock('./webgpuSpriteBatch', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGPUSpriteBatchModule>();
  return { ...actual, flushWebGPUSpriteBatch: vi.fn() };
});

vi.mock('./webgpuRenderTarget', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGPURenderTargetModule>();
  return {
    ...actual,
    beginWebGPURenderTarget: vi.fn(),
    createWebGPURenderTarget: vi.fn(
      (_state: unknown, width: number, height: number): WebGPURenderTarget => ({
        bindGroup: {} as GPUBindGroup,
        depthStencilTexture: {} as GPUTexture,
        depthStencilView: {} as GPUTextureView,
        texture: {} as GPUTexture,
        view: {} as GPUTextureView,
        format: 'bgra8unorm',
        width,
        height,
      }),
    ),
    destroyWebGPURenderTarget: vi.fn(),
    drawWebGPURenderTargetResult: vi.fn(),
    endWebGPURenderTarget: vi.fn(),
    resizeWebGPURenderTarget: vi.fn((_state: unknown, target: WebGPURenderTarget, width: number, height: number) => {
      target.width = width;
      target.height = height;
    }),
  };
});

vi.mock('./webgpuDisplayObject', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGPUDisplayObjectModule>();
  return { ...actual, renderWebGPUDisplayObject: vi.fn() };
});

function fakeScreen(options = {}): WebGPURenderState {
  const state = createRenderState(options) as unknown as WebGPURenderState;
  (state as any).device = {} as GPUDevice;
  state[EntityRuntimeKey] = createWebGPURenderStateRuntime();
  getWebGPURenderStateRuntime(state).currentBlendMode = null;
  return state;
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createWebGPUCacheState', () => {
  it('copies renderers and shares the GPU device but keeps its own node map', () => {
    const screen = fakeScreen();
    enableWebGPURenderCache(screen);
    const cacheState = createWebGPUCacheState(screen);
    expect(getWebGPURenderStateRuntime(cacheState).rendererMap.get(RenderCacheKind)).toBe(
      defaultWebGPURenderCacheRenderer,
    );
    expect((cacheState as any).device).toBe((screen as any).device);
    expect(getWebGPURenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      getWebGPURenderStateRuntime(screen).renderProxyMap,
    );
  });
});

describe('defaultWebGPURenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultWebGPURenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(drawWebGPURenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureWebGPURenderCacheTarget(state, cache, 16, 16);
    defaultWebGPURenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(drawWebGPURenderTargetResult).toHaveBeenCalledWith(state, expect.anything(), target, expect.anything());
  });

  it('flushes pending batched geometry before the immediate composite', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    ensureWebGPURenderCacheTarget(state, cache, 16, 16);
    defaultWebGPURenderCacheRenderer.submit(state, makeCacheNode(obj));
    // The composite draws an immediate quad outside the sprite batch; geometry submitted earlier in
    // the walk must be drained first, or the immediate quad interleaves with the un-flushed batch's
    // instance buffer and bind-group state and corrupts it.
    expect(flushWebGPUSpriteBatch).toHaveBeenCalledWith(state);
    expect((flushWebGPUSpriteBatch as any).mock.invocationCallOrder[0]).toBeLessThan(
      (drawWebGPURenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableWebGPURenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableWebGPURenderCache(state);
    expect(getWebGPURenderStateRuntime(state).rendererMap.get(RenderCacheKind)).toBe(defaultWebGPURenderCacheRenderer);
  });
});

describe('ensureWebGPURenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = fakeScreen();
    const target = ensureWebGPURenderCacheTarget(state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const first = ensureWebGPURenderCacheTarget(state, cache, 64, 32);
    const second = ensureWebGPURenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = fakeScreen();
    const stateB = fakeScreen();
    const cache = createRenderCache();
    expect(ensureWebGPURenderCacheTarget(stateA, cache, 8, 8)).not.toBe(
      ensureWebGPURenderCacheTarget(stateB, cache, 8, 8),
    );
  });
});

describe('getWebGPURenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getWebGPURenderCacheTarget(fakeScreen(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWebGPURenderCacheTarget(state, cache, 8, 8);
    expect(getWebGPURenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('refreshWebGPURenderCache', () => {
  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createWebGPUCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshWebGPURenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(renderWebGPUDisplayObject).toHaveBeenCalled();
    const target = getWebGPURenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createWebGPUCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshWebGPURenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshWebGPURenderCache(cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseWebGPURenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWebGPURenderCacheTarget(state, cache, 8, 8);
    releaseWebGPURenderCache(state, cache);
    expect(destroyWebGPURenderTarget).toHaveBeenCalledWith(state, target);
    expect(getWebGPURenderCacheTarget(state, cache)).toBeNull();
  });
});
