import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { createRenderCache, createRenderState, RenderCacheKind, useRenderCache } from '@flighthq/render';
import type { WebGLRenderState, WebGLRenderTarget } from '@flighthq/types';

import {
  createWebGLCacheState,
  defaultWebGLRenderCacheRenderer,
  enableWebGLRenderCache,
  ensureWebGLRenderCacheTarget,
  getWebGLRenderCacheTarget,
  refreshWebGLRenderCache,
  releaseWebGLRenderCache,
} from './webglCache';
import type * as WebGLDisplayObjectModule from './webglDisplayObject';
import { renderWebGLDisplayObject } from './webglDisplayObject';
import type * as WebGLRenderTargetModule from './webglRenderTarget';
import { destroyWebGLRenderTarget, drawWebGLRenderTargetResult } from './webglRenderTarget';

vi.mock('./webglRenderTarget', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGLRenderTargetModule>();
  return {
    ...actual,
    beginWebGLRenderTarget: vi.fn(),
    createWebGLRenderTarget: vi.fn(
      (_state: unknown, width: number, height: number): WebGLRenderTarget => ({
        framebuffer: {} as WebGLFramebuffer,
        texture: {} as WebGLTexture,
        width,
        height,
      }),
    ),
    destroyWebGLRenderTarget: vi.fn(),
    drawWebGLRenderTargetResult: vi.fn(),
    endWebGLRenderTarget: vi.fn(),
    resizeWebGLRenderTarget: vi.fn((_state: unknown, target: WebGLRenderTarget, width: number, height: number) => {
      target.width = width;
      target.height = height;
    }),
  };
});

vi.mock('./webglDisplayObject', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGLDisplayObjectModule>();
  return { ...actual, renderWebGLDisplayObject: vi.fn() };
});

function fakeScreen(options = {}): WebGLRenderState {
  const state = createRenderState(options) as unknown as WebGLRenderState;
  (state as any).gl = { clear: vi.fn(), clearColor: vi.fn(), COLOR_BUFFER_BIT: 0x4000 };
  return state;
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createWebGLCacheState', () => {
  it('copies renderers and shares the GL context but keeps its own node map', () => {
    const screen = fakeScreen();
    enableWebGLRenderCache(screen);
    const cacheState = createWebGLCacheState(screen);
    expect(cacheState.rendererMap.get(RenderCacheKind)).toBe(defaultWebGLRenderCacheRenderer);
    expect((cacheState as any).gl).toBe((screen as any).gl);
    expect(cacheState.renderProxyMap).not.toBe(screen.renderProxyMap);
  });
});

describe('defaultWebGLRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultWebGLRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(drawWebGLRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureWebGLRenderCacheTarget(state, cache, 16, 16);
    defaultWebGLRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(drawWebGLRenderTargetResult).toHaveBeenCalledWith(state, expect.anything(), target, expect.anything());
  });
});

describe('enableWebGLRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableWebGLRenderCache(state);
    expect(state.rendererMap.get(RenderCacheKind)).toBe(defaultWebGLRenderCacheRenderer);
  });
});

describe('ensureWebGLRenderCacheTarget', () => {
  it('creates a target sized to the request', () => {
    const state = fakeScreen();
    const target = ensureWebGLRenderCacheTarget(state, createRenderCache(), 64, 32);
    expect(target.width).toBe(64);
    expect(target.height).toBe(32);
  });

  it('reuses and resizes the same target on subsequent calls', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const first = ensureWebGLRenderCacheTarget(state, cache, 64, 32);
    const second = ensureWebGLRenderCacheTarget(state, cache, 16, 16);
    expect(second).toBe(first);
    expect(second.width).toBe(16);
  });

  it('keeps targets isolated per state for the same handle', () => {
    const stateA = fakeScreen();
    const stateB = fakeScreen();
    const cache = createRenderCache();
    expect(ensureWebGLRenderCacheTarget(stateA, cache, 8, 8)).not.toBe(
      ensureWebGLRenderCacheTarget(stateB, cache, 8, 8),
    );
  });
});

describe('getWebGLRenderCacheTarget', () => {
  it('returns null before a target is allocated', () => {
    expect(getWebGLRenderCacheTarget(fakeScreen(), createRenderCache())).toBeNull();
  });

  it('returns the allocated target', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWebGLRenderCacheTarget(state, cache, 8, 8);
    expect(getWebGLRenderCacheTarget(state, cache)).toBe(target);
  });
});

describe('refreshWebGLRenderCache', () => {
  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createWebGLCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshWebGLRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(renderWebGLDisplayObject).toHaveBeenCalled();
    const target = getWebGLRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createWebGLCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshWebGLRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(refreshWebGLRenderCache(cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseWebGLRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWebGLRenderCacheTarget(state, cache, 8, 8);
    releaseWebGLRenderCache(state, cache);
    expect(destroyWebGLRenderTarget).toHaveBeenCalledWith(state, target);
    expect(getWebGLRenderCacheTarget(state, cache)).toBeNull();
  });
});
