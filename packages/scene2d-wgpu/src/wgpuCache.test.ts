import { createMatrix } from '@flighthq/geometry/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type * as WgpuRenderWgpuModule from '@flighthq/render-wgpu/contract';
import {
  createRenderCache,
  createRenderState,
  enableColorAdjustmentGuards,
  getColorAdjustmentUnsupportedGuard,
  RenderCacheKind,
  useRenderCache,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
  WgpuMaterialRenderer,
  WgpuRenderState,
  RenderRootGuard,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import type * as WgpuNode2DModule from './wgpuNode2D';
import type * as WgpuQuadBatchWriterModule from './wgpuQuadBatchWriter';

// The GPU render-target lifecycle (@flighthq/render-wgpu) and the two local collaborators
// ./wgpuQuadBatchWriter and ./wgpuNode2D are stubbed so cache orchestration can be unit-tested without a
// real GPU pipeline: createWgpuRenderTarget returns a plain descriptor, and the composite, batch-flush
// and subtree-render calls become spies for the call and ordering assertions below.
//
// ★ HOISTED MOCKS, NOT HAND-ROLLED ONES. This file is in REGISTRY_ISOLATED_TESTS, so it already runs with
// its own module registry — the hermeticity the `scopeModuleMocks` + `vi.doMock` + dynamic-import dance
// bought by hand comes from the platform here, with no hook, and these stubs cannot reach the real
// render-wgpu / scene2d-wgpu consumers. The dance was not merely redundant: it rebuilt the subject's
// entire transitive module graph inside a FIXED `beforeAll` deadline — three modules plus everything they
// import — which is unbounded work against a fixed clock and the shape of flake tiering exists to remove.
//
// ★ THE FRAME STUBS REACH THROUGH `actual`, NOT THROUGH AN OUTER BINDING. A hoisted factory runs during
// this file's own import phase, so closing over a module-scope `const` declared below it would be a
// temporal-dead-zone trap that only fires once the import order changes. `actual` is in hand already.
vi.mock('./wgpuQuadBatchWriter', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuQuadBatchWriterModule>();
  return { ...actual, flushWgpuQuadBatchWriter: vi.fn() };
});
vi.mock('@flighthq/render-wgpu/contract', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuRenderWgpuModule>();
  return {
    ...actual,
    beginWgpuFrame: vi.fn((state: WgpuRenderState) => {
      actual.getWgpuRenderStateRuntime(state).commandEncoder = {} as GPUCommandEncoder;
    }),
    beginWgpuRenderPass: vi.fn(),
    setWgpuRenderTransform2D: vi.fn(),
    createWgpuRenderTarget: vi.fn(
      (_state: unknown, width: number, height: number): WgpuRenderTarget => ({
        bindGroup: {} as GPUBindGroup,
        colorSpace: 'srgb',
        depthStencilTexture: {} as GPUTexture,
        depthStencilView: {} as GPUTextureView,
        texture: {} as GPUTexture,
        view: {} as GPUTextureView,
        format: 'bgra8unorm',
        sampleCount: 1,
        clearColors: [],
        clearDepth: 1,
        width,
        height,
      }),
    ),
    destroyWgpuRenderTarget: vi.fn(),
    drawWgpuRenderTargetResult: vi.fn(),
    endWgpuRenderPass: vi.fn(),
    resizeWgpuRenderTarget: vi.fn((_state: unknown, target: WgpuRenderTarget, width: number, height: number) => {
      target.width = width;
      target.height = height;
    }),
    submitWgpuRenderPass: vi.fn((state: WgpuRenderState) => {
      actual.getWgpuRenderStateRuntime(state).commandEncoder = null;
    }),
  };
});
vi.mock('./wgpuNode2D', async (importOriginal) => {
  const actual = await importOriginal<typeof WgpuNode2DModule>();
  return { ...actual, renderWgpuScene2D: vi.fn() };
});

import {
  beginWgpuFrame,
  createWgpuRenderStateRuntime,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  getWgpuMaterialRenderer,
  getWgpuRenderStateRuntime,
  registerWgpuMaterialRenderer,
  resolveWgpuApplyBlendMode,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';

import {
  createWgpuCacheState,
  defaultWgpuRenderCacheRenderer,
  enableWgpuRenderCache,
  ensureWgpuRenderCacheTarget,
  getWgpuRenderCacheScreenState,
  getWgpuRenderCacheTarget,
  refreshWgpuRenderCache,
  releaseWgpuRenderCache,
} from './wgpuCache';
import { renderWgpuScene2D } from './wgpuNode2D';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

function fakeScreen(options = {}): WgpuRenderState {
  const state = createRenderState(options) as unknown as WgpuRenderState;
  (state as any).device = {} as GPUDevice;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.commandEncoder = null;
  runtime.currentBlendMode = null;
  return state;
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createWgpuCacheState', () => {
  it('resolves late screen blend-mode wiring explicitly until locally overridden', () => {
    const screen = fakeScreen();
    screen.applyBlendMode = null;
    const cacheState = createWgpuCacheState(screen);
    const screenHook = vi.fn();
    const laterScreenHook = vi.fn();
    const cacheHook = vi.fn();

    expect(cacheState.applyBlendMode).toBeNull();
    expect(Object.getOwnPropertyDescriptor(cacheState, 'applyBlendMode')?.get).toBeUndefined();
    expect(resolveWgpuApplyBlendMode(cacheState)).toBeNull();
    screen.applyBlendMode = screenHook;
    expect(cacheState.applyBlendMode).toBeNull();
    expect(resolveWgpuApplyBlendMode(cacheState)).toBe(screenHook);

    cacheState.applyBlendMode = cacheHook;
    screen.applyBlendMode = laterScreenHook;
    expect(resolveWgpuApplyBlendMode(cacheState)).toBe(cacheHook);
  });

  it('copies renderers and shares the GPU device but keeps its own node map', () => {
    const screen = fakeScreen();
    const resolver = vi.fn();
    const colorAdjustmentFeature: WgpuColorAdjustmentMaterialFeature = {
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record: vi.fn(),
      resolveFlush: vi.fn(() => null),
    };
    const colorAdjustmentFeatureGuard: WgpuColorAdjustmentMaterialFeatureGuard = vi.fn();
    const renderRootGuard: RenderRootGuard = vi.fn();
    const screenRuntime = getWgpuRenderStateRuntime(screen);
    screenRuntime.registries.colorAdjustments = {
      entry: { state: RegistryEntryState.Bound, value: resolver },
      onMiss: 'Disabled',
      registry: 'ColorAdjustments',
      shape: 'slot',
    };
    screenRuntime.registries.colorAdjustmentFeature = {
      entry: { state: RegistryEntryState.Bound, value: colorAdjustmentFeature },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeature',
      shape: 'slot',
    };
    screenRuntime.registries.colorAdjustmentFeatureGuard = {
      entry: { state: RegistryEntryState.Bound, value: colorAdjustmentFeatureGuard },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeatureGuard',
      shape: 'slot',
    };
    screenRuntime.registries.renderRootGuard = {
      entry: { state: RegistryEntryState.Bound, value: renderRootGuard },
      onMiss: 'Disabled',
      registry: 'RenderRootGuard',
      shape: 'slot',
    };
    enableColorAdjustmentGuards(screen);
    enableWgpuRenderCache(screen);
    const cacheState = createWgpuCacheState(screen);
    expect(getWgpuRenderStateRuntime(cacheState).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultWgpuRenderCacheRenderer,
    });
    expect((cacheState as any).device).toBe((screen as any).device);
    expect(getWgpuRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      getWgpuRenderStateRuntime(screen).renderProxyMap,
    );
    expect(getWgpuRenderStateRuntime(cacheState).registries.colorAdjustments).toBe(
      screenRuntime.registries.colorAdjustments,
    );
    expect(getWgpuRenderStateRuntime(cacheState).registries.colorAdjustmentFeature).toBe(
      screenRuntime.registries.colorAdjustmentFeature,
    );
    const cacheRuntime = getWgpuRenderStateRuntime(cacheState);
    expect(cacheRuntime.registries.colorAdjustmentFeatureGuard).toBe(
      screenRuntime.registries.colorAdjustmentFeatureGuard,
    );
    const sharedColorFeatureGuard = cacheRuntime.registries.colorAdjustmentFeatureGuard;
    screenRuntime.registries.colorAdjustmentFeatureGuard = undefined;
    expect(cacheRuntime.registries.colorAdjustmentFeatureGuard).toBe(sharedColorFeatureGuard);
    expect(cacheRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(
      screenRuntime.registries.colorAdjustmentUnsupportedGuard,
    );
    expect(getColorAdjustmentUnsupportedGuard(cacheState)).not.toBeNull();
    const sharedUnsupportedGuard = cacheRuntime.registries.colorAdjustmentUnsupportedGuard;
    screenRuntime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(getColorAdjustmentUnsupportedGuard(screen)).toBeNull();
    expect(cacheRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(sharedUnsupportedGuard);
    expect(getColorAdjustmentUnsupportedGuard(cacheState)).not.toBeNull();
    expect(cacheRuntime.registries.renderRootGuard).toBe(screenRuntime.registries.renderRootGuard);
    expect(
      getRegistryTableEntry(
        cacheRuntime.registries.renderRootGuard!,
        cacheRuntime.registries.renderRootGuard!.registry,
      ),
    ).toBe(renderRootGuard);
    const sharedRootGuard = cacheRuntime.registries.renderRootGuard;
    screenRuntime.registries.renderRootGuard = undefined;
    expect(screenRuntime.registries.renderRootGuard).toBeUndefined();
    expect(cacheRuntime.registries.renderRootGuard).toBe(sharedRootGuard);
    expect(
      getRegistryTableEntry(
        cacheRuntime.registries.renderRootGuard!,
        cacheRuntime.registries.renderRootGuard!.registry,
      ),
    ).toBe(renderRootGuard);
  });

  it('shares persistent registration snapshots through a distinct aggregate and then diverges', () => {
    const screen = fakeScreen();
    const first: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() };
    const replacement: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() };
    registerWgpuMaterialRenderer(screen, 'acme.Material', first);

    const cacheState = createWgpuCacheState(screen);
    const screenRuntime = getWgpuRenderStateRuntime(screen);
    const cacheRuntime = getWgpuRenderStateRuntime(cacheState);
    expect(cacheRuntime.registries).not.toBe(screenRuntime.registries);
    expect(cacheRuntime.registries.colorAdjustments).toBe(screenRuntime.registries.colorAdjustments);
    expect(cacheRuntime.registries.compressedTextureDecoder).toBe(screenRuntime.registries.compressedTextureDecoder);
    expect(cacheRuntime.registries.compressedTextureUpload).toBe(screenRuntime.registries.compressedTextureUpload);
    expect(cacheRuntime.registries.customMaterialShaders).toBe(screenRuntime.registries.customMaterialShaders);
    expect(cacheRuntime.registries.materialRenderers).toBe(screenRuntime.registries.materialRenderers);
    expect(cacheRuntime.registries.meshMaterialRenderers).toBe(screenRuntime.registries.meshMaterialRenderers);
    expect(cacheRuntime.registries.renderEffects).toBe(screenRuntime.registries.renderEffects);
    expect(cacheRuntime.registries.shapeRasterizer).toBe(screenRuntime.registries.shapeRasterizer);
    expect(cacheRuntime.registries.strokeTessellator).toBe(screenRuntime.registries.strokeTessellator);
    expect(cacheRuntime.registries.textureResolvers).toBe(screenRuntime.registries.textureResolvers);
    expect(cacheRuntime.registries.velocityWriters).toBe(screenRuntime.registries.velocityWriters);
    expect(getWgpuMaterialRenderer(cacheState, 'acme.Material')).toBe(first);

    registerWgpuMaterialRenderer(screen, 'acme.Material', replacement);

    expect(getWgpuMaterialRenderer(screen, 'acme.Material')).toBe(replacement);
    expect(getWgpuMaterialRenderer(cacheState, 'acme.Material')).toBe(first);
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
    // The composite draws an immediate quad outside the quad-batch writer; geometry submitted earlier in
    // the walk must be drained first, or the immediate quad interleaves with the un-flushed batch's
    // instance buffer and bind-group state and corrupts it.
    expect(flushWgpuQuadBatchWriter).toHaveBeenCalledWith(state);
    expect((flushWgpuQuadBatchWriter as any).mock.invocationCallOrder[0]).toBeLessThan(
      (drawWgpuRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableWgpuRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableWgpuRenderCache(state);
    expect(getWgpuRenderStateRuntime(state).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultWgpuRenderCacheRenderer,
    });
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

describe('getWgpuRenderCacheScreenState', () => {
  it('resolves a cache render state to the screen state that owns shared GPU resources', () => {
    const screen = fakeScreen();
    const cacheState = createWgpuCacheState(screen);

    expect(getWgpuRenderCacheScreenState(cacheState)).toBe(screen);
    expect(getWgpuRenderCacheScreenState(screen)).toBe(screen);
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
  it('opens and submits a standalone frame when called outside the visible frame', () => {
    const screen = fakeScreen();
    const cacheState = createWgpuCacheState(screen);
    refreshWgpuRenderCache(cacheState, createRenderCache(), createDisplayObject(), { padding: 5 });
    expect(beginWgpuFrame).toHaveBeenCalledWith(screen);
    expect(submitWgpuRenderPass).toHaveBeenCalledWith(screen);
    expect(getWgpuRenderStateRuntime(screen).commandEncoder).toBeNull();
  });

  it('records into an active application frame without submitting it', () => {
    const screen = fakeScreen();
    const encoder = {} as GPUCommandEncoder;
    getWgpuRenderStateRuntime(screen).commandEncoder = encoder;
    const cacheState = createWgpuCacheState(screen);
    vi.mocked(beginWgpuFrame).mockClear();
    vi.mocked(submitWgpuRenderPass).mockClear();
    refreshWgpuRenderCache(cacheState, createRenderCache(), createDisplayObject(), { padding: 5 });
    expect(beginWgpuFrame).not.toHaveBeenCalled();
    expect(submitWgpuRenderPass).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(screen).commandEncoder).toBe(encoder);
  });

  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createWgpuCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshWgpuRenderCache(cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(renderWgpuScene2D).toHaveBeenCalled();
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
