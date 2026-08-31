import { createMatrix } from '@flighthq/geometry/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import * as renderWgpu from '@flighthq/render-wgpu/contract';
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
  WgpuPresentationRenderState,
  WgpuRenderState,
  RenderRootGuard,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import {
  createWgpuCacheState,
  defaultWgpuRenderCacheRenderer,
  enableWgpuRenderCache,
  ensureWgpuRenderCacheTarget,
  getWgpuRenderCacheTarget,
  refreshWgpuRenderCache,
  releaseWgpuRenderCache,
} from './wgpuCache';
import * as wgpuNode2D from './wgpuNode2D';
import * as wgpuQuadBatchWriter from './wgpuQuadBatchWriter';

// The GPU render-target lifecycle (@flighthq/render-wgpu) and the two local collaborators
// ./wgpuQuadBatchWriter and ./wgpuNode2D are stubbed so cache orchestration can be unit-tested without a
// real GPU pipeline: createWgpuRenderTarget returns a plain descriptor, and the composite, batch-flush
// and subtree-render calls become spies for the call and ordering assertions below.
beforeEach(() => {
  vi.spyOn(wgpuQuadBatchWriter, 'flushWgpuQuadBatchWriter').mockImplementation((() => {}) as never);

  const beginWgpuFrameSpy = vi.spyOn(renderWgpu, 'beginWgpuFrame').mockImplementation(((state: WgpuRenderState) => {
    renderWgpu.getWgpuRenderStateRuntime(state).commandEncoder = {} as GPUCommandEncoder;
  }) as never);
  const submitWgpuRenderPassSpy = vi.spyOn(renderWgpu, 'submitWgpuRenderPass').mockImplementation(((
    state: WgpuRenderState,
  ) => {
    renderWgpu.getWgpuRenderStateRuntime(state).commandEncoder = null;
  }) as never);
  vi.spyOn(renderWgpu, 'beginWgpuRenderPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderWgpu, 'createWgpuOffscreenRenderState').mockImplementation(((
    deviceState: any,
    pipeline: any,
    options: any = {},
  ) => {
    const state = createRenderState({
      allowSmoothing: options.imageSmoothingEnabled ?? true,
      pixelRatio: options.pixelRatio ?? 1,
      roundPixels: options.roundPixels ?? false,
      sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
    }) as WgpuRenderState;
    Object.assign(state, {
      applyBlendMode: null,
      device: deviceState.device,
      deviceState,
      format: options.format ?? 'bgra8unorm',
      pipeline,
    });
    const runtime = renderWgpu.createWgpuRenderStateRuntime(deviceState, pipeline);
    state[EntityRuntimeKey] = runtime;
    Object.assign(runtime, {
      commandEncoder: null,
      currentBlendMode: null,
      currentMaskDepth: 0,
      currentRenderTarget: null,
      depthStencilTexture: null,
      particleInstanceBuffer: null,
      quadBatchWriterBufferPool: [],
      renderPass: null,
      retiredBuffers: [],
      retiredTextures: [],
      surfaceAntialiasTexture: null,
      uniformBuffer: { destroy: vi.fn() } as unknown as GPUBuffer,
      uniformData: new Float32Array(0),
      uniformOffset: 0,
    });
    return state;
  }) as never);
  vi.spyOn(renderWgpu, 'setWgpuRenderTransform2D').mockImplementation((() => {}) as never);
  vi.spyOn(renderWgpu, 'createWgpuRenderTarget').mockImplementation(
    ((_state: unknown, width: number, height: number): WgpuRenderTarget => ({
      bindings: new Map(),
      mipLevelCount: 1,
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
    })) as never,
  );
  vi.spyOn(renderWgpu, 'destroyWgpuRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderWgpu, 'drawWgpuRenderTargetResult').mockImplementation((() => {}) as never);
  vi.spyOn(renderWgpu, 'endWgpuRenderPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderWgpu, 'resizeWgpuRenderTarget').mockImplementation(((
    _state: unknown,
    target: WgpuRenderTarget,
    width: number,
    height: number,
  ) => {
    target.width = width;
    target.height = height;
  }) as never);
  vi.spyOn(renderWgpu, 'withWgpuFrameBorrow').mockImplementation(((
    owner: WgpuRenderState,
    borrower: WgpuRenderState,
    callback: () => unknown,
  ) => {
    const ownerRuntime = renderWgpu.getWgpuRenderStateRuntime(owner);
    const borrowerRuntime = renderWgpu.getWgpuRenderStateRuntime(borrower);
    const ownsFrame = ownerRuntime.commandEncoder === null;
    if (ownsFrame) beginWgpuFrameSpy(owner);
    borrowerRuntime.commandEncoder = ownerRuntime.commandEncoder;
    try {
      return callback();
    } finally {
      borrowerRuntime.commandEncoder = null;
      if (ownsFrame) submitWgpuRenderPassSpy(owner);
    }
  }) as never);
  vi.spyOn(wgpuNode2D, 'renderWgpuScene2D').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

function fakeScreen(options = {}): WgpuPresentationRenderState {
  const state = createRenderState(options) as unknown as WgpuPresentationRenderState;
  const device = {} as GPUDevice;
  const deviceState = renderWgpu.createWgpuDeviceState(device);
  const pipeline = renderWgpu.createWgpuPipeline(renderWgpu.createEmptyWgpuRegistries());
  Object.assign(state, {
    context: {} as GPUCanvasContext,
    device,
    deviceState,
    format: 'bgra8unorm' as GPUTextureFormat,
    pipeline,
    surface: { height: 600, width: 800 },
  });
  state[EntityRuntimeKey] = renderWgpu.createWgpuRenderStateRuntime(deviceState, pipeline);
  const runtime = renderWgpu.getWgpuRenderStateRuntime(state);
  runtime.commandEncoder = null;
  runtime.currentBlendMode = null;
  return state;
}

function createCacheState(screen: WgpuPresentationRenderState): WgpuRenderState {
  return createWgpuCacheState(
    screen,
    screen.deviceState,
    renderWgpu.createWgpuPipeline(renderWgpu.getWgpuRenderStateRuntime(screen).registries),
    {
      format: screen.format,
      imageSmoothingEnabled: screen.allowSmoothing,
      pixelRatio: screen.pixelRatio,
      roundPixels: screen.roundPixels,
      sceneGraphSyncPolicy: screen.sceneGraphSyncPolicy,
    },
  );
}

function makeCacheNode(source: unknown): any {
  return { source, kind: RenderCacheKind, transform2D: createMatrix(), alpha: 1, blendMode: null };
}

describe('createWgpuCacheState', () => {
  it('does not destroy a uniform buffer owned by the screen state', () => {
    const screen = fakeScreen();
    const destroyUniformBuffer = vi.fn();
    const screenRuntime = renderWgpu.getWgpuRenderStateRuntime(screen);
    screenRuntime.uniformBuffer = { destroy: destroyUniformBuffer } as unknown as GPUBuffer;
    screenRuntime.quadBatchWriterBufferPool = [];

    const cacheState = createCacheState(screen);
    renderWgpu.destroyWgpuRenderState(cacheState);

    expect(destroyUniformBuffer).not.toHaveBeenCalled();
  });

  it('does not retain the device tier when an owned cache state is left undisposed', () => {
    const screen = fakeScreen();
    const screenRuntime = renderWgpu.getWgpuRenderStateRuntime(screen);
    const teardown = vi.fn();
    screenRuntime.context.teardowns.push(teardown);
    screenRuntime.quadBatchWriterBufferPool = [];

    createCacheState(screen);
    renderWgpu.destroyWgpuRenderState(screen);

    expect(teardown).toHaveBeenCalledOnce();
  });

  it('resolves late screen blend-mode wiring explicitly until locally overridden', () => {
    const screen = fakeScreen();
    screen.applyBlendMode = null;
    const cacheState = createCacheState(screen);
    const screenHook = vi.fn();
    const laterScreenHook = vi.fn();
    const cacheHook = vi.fn();

    expect(cacheState.applyBlendMode).toBeNull();
    expect(Object.getOwnPropertyDescriptor(cacheState, 'applyBlendMode')?.get).toBeUndefined();
    expect(renderWgpu.resolveWgpuApplyBlendMode(cacheState)).toBeNull();
    screen.applyBlendMode = screenHook;
    expect(cacheState.applyBlendMode).toBeNull();
    expect(renderWgpu.resolveWgpuApplyBlendMode(cacheState)).toBe(screenHook);

    cacheState.applyBlendMode = cacheHook;
    screen.applyBlendMode = laterScreenHook;
    expect(renderWgpu.resolveWgpuApplyBlendMode(cacheState)).toBe(cacheHook);
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
    const screenRuntime = renderWgpu.getWgpuRenderStateRuntime(screen);
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
    const cacheState = createCacheState(screen);
    expect(renderWgpu.getWgpuRenderStateRuntime(cacheState).registries.renderers.entries.get(RenderCacheKind)).toEqual({
      state: 'bound',
      value: defaultWgpuRenderCacheRenderer,
    });
    expect((cacheState as any).device).toBe((screen as any).device);
    expect(renderWgpu.getWgpuRenderStateRuntime(cacheState).renderProxyMap).not.toBe(
      renderWgpu.getWgpuRenderStateRuntime(screen).renderProxyMap,
    );
    expect(renderWgpu.getWgpuRenderStateRuntime(cacheState).registries.colorAdjustments).toBe(
      screenRuntime.registries.colorAdjustments,
    );
    expect(renderWgpu.getWgpuRenderStateRuntime(cacheState).registries.colorAdjustmentFeature).toBe(
      screenRuntime.registries.colorAdjustmentFeature,
    );
    const cacheRuntime = renderWgpu.getWgpuRenderStateRuntime(cacheState);
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
    renderWgpu.registerWgpuMaterialRenderer(screen, 'acme.Material', first);

    const cacheState = createCacheState(screen);
    const screenRuntime = renderWgpu.getWgpuRenderStateRuntime(screen);
    const cacheRuntime = renderWgpu.getWgpuRenderStateRuntime(cacheState);
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
    expect(renderWgpu.getWgpuMaterialRenderer(cacheState, 'acme.Material')).toBe(first);

    renderWgpu.registerWgpuMaterialRenderer(screen, 'acme.Material', replacement);

    expect(renderWgpu.getWgpuMaterialRenderer(screen, 'acme.Material')).toBe(replacement);
    expect(renderWgpu.getWgpuMaterialRenderer(cacheState, 'acme.Material')).toBe(first);
  });
});

describe('defaultWgpuRenderCacheRenderer', () => {
  it('does nothing when no cache is attached to the source', () => {
    const state = fakeScreen();
    defaultWgpuRenderCacheRenderer.submit(state, makeCacheNode(createDisplayObject()));
    expect(renderWgpu.drawWgpuRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites the cache target attached to the source node', () => {
    const state = fakeScreen();
    const obj = createDisplayObject();
    const cache = createRenderCache();
    useRenderCache(state, obj, cache);
    const target = ensureWgpuRenderCacheTarget(state, cache, 16, 16);
    defaultWgpuRenderCacheRenderer.submit(state, makeCacheNode(obj));
    expect(renderWgpu.drawWgpuRenderTargetResult).toHaveBeenCalledWith(
      state,
      expect.anything(),
      target,
      expect.anything(),
    );
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
    expect(wgpuQuadBatchWriter.flushWgpuQuadBatchWriter).toHaveBeenCalledWith(state);
    expect((wgpuQuadBatchWriter.flushWgpuQuadBatchWriter as any).mock.invocationCallOrder[0]).toBeLessThan(
      (renderWgpu.drawWgpuRenderTargetResult as any).mock.invocationCallOrder[0],
    );
  });
});

describe('enableWgpuRenderCache', () => {
  it('registers the renderer for the render cache kind', () => {
    const state = fakeScreen();
    enableWgpuRenderCache(state);
    expect(renderWgpu.getWgpuRenderStateRuntime(state).registries.renderers.entries.get(RenderCacheKind)).toEqual({
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

  it('enumerates and destroys every owned target during state teardown', () => {
    const state = fakeScreen();
    const runtime = renderWgpu.getWgpuRenderStateRuntime(state);
    runtime.quadBatchWriterBufferPool = [];
    const firstCache = createRenderCache();
    const secondCache = createRenderCache();
    const first = ensureWgpuRenderCacheTarget(state, firstCache, 8, 8);
    const second = ensureWgpuRenderCacheTarget(state, secondCache, 16, 16);

    renderWgpu.destroyWgpuRenderState(state);

    expect(renderWgpu.destroyWgpuRenderTarget).toHaveBeenCalledWith(state, first);
    expect(renderWgpu.destroyWgpuRenderTarget).toHaveBeenCalledWith(state, second);
    expect(getWgpuRenderCacheTarget(state, firstCache)).toBeNull();
    expect(getWgpuRenderCacheTarget(state, secondCache)).toBeNull();
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
    const cacheState = createCacheState(screen);
    refreshWgpuRenderCache(screen, cacheState, createRenderCache(), createDisplayObject(), { padding: 5 });
    expect(renderWgpu.beginWgpuFrame).toHaveBeenCalledWith(screen);
    expect(renderWgpu.submitWgpuRenderPass).toHaveBeenCalledWith(screen);
    expect(renderWgpu.getWgpuRenderStateRuntime(screen).commandEncoder).toBeNull();
  });

  it('records into an active application frame without submitting it', () => {
    const screen = fakeScreen();
    const encoder = {} as GPUCommandEncoder;
    renderWgpu.getWgpuRenderStateRuntime(screen).commandEncoder = encoder;
    const cacheState = createCacheState(screen);
    vi.mocked(renderWgpu.beginWgpuFrame).mockClear();
    vi.mocked(renderWgpu.submitWgpuRenderPass).mockClear();
    refreshWgpuRenderCache(screen, cacheState, createRenderCache(), createDisplayObject(), { padding: 5 });
    expect(renderWgpu.beginWgpuFrame).not.toHaveBeenCalled();
    expect(renderWgpu.submitWgpuRenderPass).not.toHaveBeenCalled();
    expect(renderWgpu.getWgpuRenderStateRuntime(screen).commandEncoder).toBe(encoder);
  });

  it('bakes on the first call and allocates the target on the screen state', () => {
    const screen = fakeScreen();
    const cacheState = createCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    const rebaked = refreshWgpuRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(rebaked).toBe(true);
    expect(wgpuNode2D.renderWgpuScene2D).toHaveBeenCalled();
    const target = getWgpuRenderCacheTarget(screen, cache);
    expect(target).not.toBeNull();
    expect(target!.width).toBe(10);
  });

  it('skips the bake under requiresInvalidation when nothing changed', () => {
    const screen = fakeScreen({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const cacheState = createCacheState(screen);
    const cache = createRenderCache();
    const obj = createDisplayObject();
    refreshWgpuRenderCache(screen, cacheState, cache, obj, { padding: 5 });
    expect(refreshWgpuRenderCache(screen, cacheState, cache, obj, { padding: 5 })).toBe(false);
  });
});

describe('releaseWgpuRenderCache', () => {
  it('destroys and drops the target for the cache', () => {
    const state = fakeScreen();
    const cache = createRenderCache();
    const target = ensureWgpuRenderCacheTarget(state, cache, 8, 8);
    releaseWgpuRenderCache(state, cache);
    expect(renderWgpu.destroyWgpuRenderTarget).toHaveBeenCalledWith(state, target);
    expect(getWgpuRenderCacheTarget(state, cache)).toBeNull();
  });
});
