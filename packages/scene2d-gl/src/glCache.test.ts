import { createEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import * as renderGl from '@flighthq/render-gl/contract';
import { createRenderCache, RenderCacheKind, useRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import {
  createGlCacheState,
  defaultGlRenderCacheRenderer,
  enableGlRenderCache,
  ensureGlRenderCacheTarget,
  getGlRenderCacheTarget,
  refreshGlRenderCache,
  releaseGlRenderCache,
} from './glCache';
import * as glNode2D from './glNode2D';
import * as glQuadBatchWriter from './glQuadBatchWriter';

// The GL render-target lifecycle (@flighthq/render-gl) and the two local collaborators
// ./glQuadBatchWriter and ./glNode2D are stubbed so cache orchestration can be unit-tested without a real
// GL pipeline: createGlRenderTarget returns a plain descriptor, and the composite, batch-flush and
// subtree-render calls become spies for the call and ordering assertions below.
beforeEach(() => {
  vi.spyOn(glQuadBatchWriter, 'flushGlQuadBatchWriter').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'beginGlRenderPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'setGlRenderTransform2D').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'createGlRenderTarget').mockImplementation(((
    _state: unknown,
    descriptor: { width: number; height: number },
  ): GlRenderTarget => {
    const texture = {} as WebGLTexture;
    return createEntity({
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
    });
  }) as never);
  vi.spyOn(renderGl, 'destroyGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'drawGlRenderTargetResult').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'endGlRenderPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderGl, 'resizeGlRenderTarget').mockImplementation(((
    _state: unknown,
    target: GlRenderTarget,
    width: number,
    height: number,
  ) => {
    target.width = width;
    target.height = height;
  }) as never);
  vi.spyOn(glNode2D, 'renderGlScene2D').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

const testPipeline = renderGl.createGlPipeline(renderGl.createEmptyGlRegistries());

function fakeScreen(options = {}): GlRenderState {
  const gl = document.createElement('canvas').getContext('webgl2')!;
  return renderGl.createGlRenderState(renderGl.createGlContextState(gl), testPipeline, options);
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createGlCacheState', () => {
  it('copies renderers and shares the GL context but keeps its own node map', () => {
    const screen = fakeScreen();
    enableGlRenderCache(screen);
    const cacheState = createGlCacheState(
      screen,
      screen.contextState,
      renderGl.createGlPipeline(renderGl.getGlRenderStateRuntime(screen).registries),
    );
    expect(renderGl.getGlRenderStateRuntime(cacheState).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultGlRenderCacheRenderer,
    });
    expect((cacheState as any).gl).toBe((screen as any).gl);
    expect(renderGl.getGlRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      renderGl.getGlRenderStateRuntime(screen).renderProxyMap,
    );
  });

  it('does not retain the context tier when an owned cache state is left undisposed', () => {
    const screen = fakeScreen();
    const teardown = vi.fn();
    renderGl.getGlRenderStateRuntime(screen).context.teardowns.push(teardown);

    createGlCacheState(screen, screen.contextState, screen.pipeline);
    renderGl.destroyGlRenderState(screen);

    expect(teardown).toHaveBeenCalledOnce();
  });
});

describe('defaultGlRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultGlRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(renderGl.drawGlRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureGlRenderCacheTarget(state, cache, 16, 16);
    defaultGlRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(renderGl.drawGlRenderTargetResult).toHaveBeenCalledWith(state, expect.anything(), target, expect.anything());
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
    expect(glQuadBatchWriter.flushGlQuadBatchWriter).toHaveBeenCalledWith(state);
    expect((glQuadBatchWriter.flushGlQuadBatchWriter as any).mock.invocationCallOrder[0]).toBeLessThan(
      (renderGl.drawGlRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableGlRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableGlRenderCache(state);
    expect(renderGl.getGlRenderStateRuntime(state).registries.renderers.entries.get(RenderCacheKind)).toEqual({
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
    const cacheState = createGlCacheState(screen, screen.contextState, screen.pipeline);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshGlRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(glNode2D.renderGlScene2D).toHaveBeenCalled();
    const target = getGlRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createGlCacheState(screen, screen.contextState, screen.pipeline, {
      sceneGraphSyncPolicy: 'requiresInvalidation',
    });
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshGlRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(refreshGlRenderCache(screen, cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseGlRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureGlRenderCacheTarget(state, cache, 8, 8);
    releaseGlRenderCache(state, cache);
    expect(renderGl.destroyGlRenderTarget).toHaveBeenCalledWith(state, target);
    expect(getGlRenderCacheTarget(state, cache)).toBeNull();
  });

  it('destroys every enumerated target when the owning state is destroyed', () => {
    const state = fakeScreen();
    ensureGlRenderCacheTarget(state, createRenderCache(), 8, 8);
    ensureGlRenderCacheTarget(state, createRenderCache(), 16, 16);
    vi.mocked(renderGl.destroyGlRenderTarget).mockClear();

    renderGl.destroyGlRenderState(state);

    expect(renderGl.destroyGlRenderTarget).toHaveBeenCalledTimes(2);
  });
});
