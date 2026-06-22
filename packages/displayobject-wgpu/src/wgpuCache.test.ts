import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render';
import type * as WgpuRenderTargetModule from '@flighthq/render-wgpu';
import { createWgpuRenderStateRuntime, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { destroyWgpuRenderTarget, drawWgpuRenderTargetResult } from '@flighthq/render-wgpu';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import {
  createWgpuCacheState,
  defaultWgpuRenderCacheRenderer,
  enableWgpuRenderCache,
  ensureWgpuRenderCacheTarget,
  getWgpuRenderCacheTarget,
  refreshWgpuRenderCache,
  releaseWgpuRenderCache,
} from './wgpuCache';
import type * as WgpuDisplayObjectModule from './wgpuDisplayObject';
import { renderWgpuDisplayObject } from './wgpuDisplayObject';
import type * as WgpuSpriteBatchModule from './wgpuSpriteBatch';
import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

vi.mock('./wgpuSpriteBatch', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuSpriteBatchModule>();
  return { ...actual, flushWgpuSpriteBatch: vi.fn() };
});

vi.mock('@flighthq/render-wgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuRenderTargetModule>();
  return {
    ...actual,
    beginWgpuRenderTarget: vi.fn(),
    createWgpuRenderTarget: vi.fn(
      (_state: unknown, width: number, height: number): WgpuRenderTarget => ({
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
    destroyWgpuRenderTarget: vi.fn(),
    drawWgpuRenderTargetResult: vi.fn(),
    endWgpuRenderTarget: vi.fn(),
    resizeWgpuRenderTarget: vi.fn((_state: unknown, target: WgpuRenderTarget, width: number, height: number) => {
      target.width = width;
      target.height = height;
    }),
  };
});

vi.mock('./wgpuDisplayObject', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuDisplayObjectModule>();
  return { ...actual, renderWgpuDisplayObject: vi.fn() };
});

function fakeScreen(options = {}): WgpuRenderState {
  const state = createRenderState(options) as unknown as WgpuRenderState;
  (state as any).device = {} as GPUDevice;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
  getWgpuRenderStateRuntime(state).currentBlendMode = null;
  return state;
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createWgpuCacheState', () => {
  it('copies renderers and shares the GPU device but keeps its own node map', () => {
    const screen = fakeScreen();
    enableWgpuRenderCache(screen);
    const cacheState = createWgpuCacheState(screen);
    expect(getWgpuRenderStateRuntime(cacheState).rendererMap.get(RenderCacheKind)).toBe(defaultWgpuRenderCacheRenderer);
    expect((cacheState as any).device).toBe((screen as any).device);
    expect(getWgpuRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      getWgpuRenderStateRuntime(screen).renderProxyMap,
    );
  });
});

describe('defaultWgpuRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultWgpuRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(drawWgpuRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureWgpuRenderCacheTarget(state, cache, 16, 16);
    defaultWgpuRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(drawWgpuRenderTargetResult).toHaveBeenCalledWith(state, expect.anything(), target, expect.anything());
  });

  it('flushes pending batched geometry before the immediate composite', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    ensureWgpuRenderCacheTarget(state, cache, 16, 16);
    defaultWgpuRenderCacheRenderer.submit(state, makeCacheNode(obj));
    // The composite draws an immediate quad outside the sprite batch; geometry submitted earlier in
    // the walk must be drained first, or the immediate quad interleaves with the un-flushed batch's
    // instance buffer and bind-group state and corrupts it.
    expect(flushWgpuSpriteBatch).toHaveBeenCalledWith(state);
    expect((flushWgpuSpriteBatch as any).mock.invocationCallOrder[0]).toBeLessThan(
      (drawWgpuRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableWgpuRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableWgpuRenderCache(state);
    expect(getWgpuRenderStateRuntime(state).rendererMap.get(RenderCacheKind)).toBe(defaultWgpuRenderCacheRenderer);
  });
});

describe('ensureWgpuRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = fakeScreen();
    const target = ensureWgpuRenderCacheTarget(state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const first = ensureWgpuRenderCacheTarget(state, cache, 64, 32);
    const second = ensureWgpuRenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = fakeScreen();
    const stateB = fakeScreen();
    const cache = createRenderCache();
    expect(ensureWgpuRenderCacheTarget(stateA, cache, 8, 8)).not.toBe(ensureWgpuRenderCacheTarget(stateB, cache, 8, 8));
  });
});

describe('getWgpuRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getWgpuRenderCacheTarget(fakeScreen(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWgpuRenderCacheTarget(state, cache, 8, 8);
    expect(getWgpuRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('refreshWgpuRenderCache', () => {
  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createWgpuCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshWgpuRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(renderWgpuDisplayObject).toHaveBeenCalled();
    const target = getWgpuRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createWgpuCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshWgpuRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshWgpuRenderCache(cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseWgpuRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWgpuRenderCacheTarget(state, cache, 8, 8);
    releaseWgpuRenderCache(state, cache);
    expect(destroyWgpuRenderTarget).toHaveBeenCalledWith(state, target);
    expect(getWgpuRenderCacheTarget(state, cache)).toBeNull();
  });
});
