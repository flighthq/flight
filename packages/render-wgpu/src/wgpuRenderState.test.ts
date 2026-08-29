import { createEntity } from '@flighthq/entity/contract';
import {
  createKeyedTable,
  getRegistryTableEntry,
  hasRegistryTableEntry,
  withRegistryTableEntry,
} from '@flighthq/registry/contract';
import {
  copyAllRenderersFromRenderState,
  enableColorAdjustmentGuards,
  enableColorAdjustments,
  getColorAdjustmentUnsupportedGuard,
  getRenderStateRuntime,
  prepareScene2DRender,
  registerRenderer,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  RenderEffectPaddingResolver,
  RenderRootGuard,
  RenderState,
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
  WgpuHostAcquisition,
  WgpuHostBackend,
  WgpuPresentationSurface,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getWgpuSurfaceRenderExtent } from './wgpuAntialias';
import { beginWgpuFrame } from './wgpuBackground';
import { registerWgpuCompressedTextureDecoder, registerWgpuCompressedTextureUpload } from './wgpuCompressedTexture';
import { setWgpuHostBackend } from './wgpuHost';
import { registerWgpuMaterialRenderer } from './wgpuMaterialRegistry';
import {
  copyWgpuRenderStateRegistrations,
  createWgpuOffscreenRenderState,
  createWgpuAcquisitionFromCanvasElement,
  createWgpuRenderState,
  createWgpuRenderStateFromCanvasElement,
  releaseWgpuAcquisition,
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
  destroyWgpuRenderState,
  getWgpuColorAdjustmentMaterialFeature,
  getWgpuColorAdjustmentMaterialFeatureGuard,
  getWgpuRenderStateRuntime,
  getWgpuSampler,
  isWgpuSupported,
  registerWgpuDeviceTeardown,
  resolveWgpuApplyBlendMode,
} from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { registerWgpuTextureResolver } from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

function getPaddingResolver(state: RenderState, kind: string): RenderEffectPaddingResolver | null {
  const table = getRenderStateRuntime(state).registries.effectPaddingResolvers;
  return table === undefined ? null : getRegistryTableEntry(table, kind);
}

function registerPaddingResolver(state: RenderState, kind: string, resolver: RenderEffectPaddingResolver): void {
  const runtime = getRenderStateRuntime(state);
  runtime.registries.effectPaddingResolvers = withRegistryTableEntry(
    runtime.registries.effectPaddingResolvers ??
      createKeyedTable<RenderEffectPaddingResolver>('RenderEffectPaddingResolver', 'Zero'),
    kind,
    resolver,
  );
}

describe('copyWgpuRenderStateRegistrations', () => {
  it('copies late Wgpu registrations only when explicitly requested', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const materialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() } as never;
    const offscreenMaterialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() } as never;
    const decoder = vi.fn(() => new Uint8ClampedArray(4));
    const resolver = vi.fn(() => null);
    registerWgpuCompressedTextureDecoder(screen, decoder);
    registerWgpuCompressedTextureUpload(screen);
    registerWgpuMaterialRenderer(screen, 'acme.LateMaterial', materialRenderer);
    registerWgpuTextureResolver(screen, 'acme.LateTexture', resolver);

    expect(
      hasRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(false);
    expect(
      hasRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(false);
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toBeNull();
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureUpload.entry).toBeNull();
    copyWgpuRenderStateRegistrations(offscreen, screen);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(materialRenderer);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(resolver);
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBe(
      getWgpuRenderStateRuntime(screen).registries.compressedTextureDecoder,
    );
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: decoder,
    });
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBe(
      getWgpuRenderStateRuntime(screen).registries.compressedTextureUpload,
    );
    registerWgpuMaterialRenderer(offscreen, 'acme.LateMaterial', offscreenMaterialRenderer);
    registerWgpuCompressedTextureDecoder(offscreen, null);
    registerWgpuCompressedTextureUpload(offscreen, null);
    registerWgpuTextureResolver(offscreen, 'acme.LateTexture', null);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(offscreenMaterialRenderer);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(screen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(materialRenderer);
    expect(
      hasRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(false);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(screen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(resolver);
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder.entry).toBeNull();
    expect(getWgpuRenderStateRuntime(screen).registries.compressedTextureDecoder.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureUpload.entry).toBeNull();
    expect(getWgpuRenderStateRuntime(screen).registries.compressedTextureUpload.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
  });
});

describe('createWgpuAcquisitionFromCanvasElement', () => {
  it('hands back handles the CALLER owns, so no state teardown can release them', async () => {
    const acquisition = await createWgpuAcquisitionFromCanvasElement(document.createElement('canvas'));

    expect(acquisition).not.toBeNull();
    expect(acquisition!.ownership).toBe('caller');
    expect(acquisition!.surface).toBeDefined();
    releaseWgpuAcquisition(acquisition!);
  });

  // ★ NULL, NOT THROW. "This environment cannot give me WebGPU" is an expected outcome, not API misuse, so
  // it reports through the return value like every other expected failure in this SDK.
  it('returns null when the host cannot acquire, rather than rejecting', async () => {
    setWgpuHostBackend({
      acquire: vi.fn(async () => {
        throw new Error('no adapter');
      }),
      isSupported: vi.fn(() => false),
      release: vi.fn(),
    });

    await expect(createWgpuAcquisitionFromCanvasElement(document.createElement('canvas'))).resolves.toBeNull();
    setWgpuHostBackend(null);
  });
});

describe('createWgpuDeviceState', () => {
  it('allocates distinct owners for repeated calls with the same raw device', () => {
    const device = {} as GPUDevice;
    expect(createWgpuDeviceState(device)).not.toBe(createWgpuDeviceState(device));
  });
});

describe('createWgpuOffscreenRenderState', () => {
  it('resolves late screen blend-mode wiring explicitly until locally overridden', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const nested = createWgpuOffscreenRenderState(offscreen);
    const screenHook = vi.fn();
    const laterScreenHook = vi.fn();
    const offscreenHook = vi.fn();

    expect(offscreen.applyBlendMode).toBeNull();
    expect(Object.getOwnPropertyDescriptor(offscreen, 'applyBlendMode')?.get).toBeUndefined();
    expect(resolveWgpuApplyBlendMode(offscreen)).toBeNull();
    screen.applyBlendMode = screenHook;
    expect(offscreen.applyBlendMode).toBeNull();
    expect(resolveWgpuApplyBlendMode(offscreen)).toBe(screenHook);
    expect(resolveWgpuApplyBlendMode(nested)).toBe(screenHook);

    offscreen.applyBlendMode = offscreenHook;
    screen.applyBlendMode = laterScreenHook;
    expect(resolveWgpuApplyBlendMode(offscreen)).toBe(offscreenHook);
    expect(resolveWgpuApplyBlendMode(nested)).toBe(offscreenHook);

    copyWgpuRenderStateRegistrations(offscreen, screen);
    expect(offscreen.applyBlendMode).toBeNull();
    expect(resolveWgpuApplyBlendMode(offscreen)).toBe(laterScreenHook);
  });

  it('shares device resources while snapshotting independent registration policy', async () => {
    const screen = await createWgpuRenderStateForTest();
    const renderer = { createData: () => null, submit: vi.fn() };
    const materialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() } as never;
    const paddingResolver = vi.fn(() => ({ bottom: 1, left: 1, right: 1, top: 1 }));
    const textureResolver = vi.fn(() => null);
    const effectRunner = vi.fn();
    const colorAdjustmentFeature: WgpuColorAdjustmentMaterialFeature = {
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record: vi.fn(),
      resolveFlush: vi.fn(() => null),
    };
    const colorAdjustmentFeatureGuard: WgpuColorAdjustmentMaterialFeatureGuard = vi.fn();
    const renderRootGuard: RenderRootGuard = vi.fn();
    registerRenderer(screen, 'acme.Node', renderer);
    registerWgpuMaterialRenderer(screen, 'acme.Material', materialRenderer);
    registerWgpuTextureResolver(screen, 'acme.Texture', textureResolver);
    enableColorAdjustments(screen);
    enableColorAdjustmentGuards(screen);
    registerPaddingResolver(screen, 'acme.Effect', paddingResolver);
    getWgpuRenderStateRuntime(screen).registries.colorAdjustmentFeature = {
      entry: { state: RegistryEntryState.Bound, value: colorAdjustmentFeature },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeature',
      shape: 'slot',
    };
    getWgpuRenderStateRuntime(screen).registries.colorAdjustmentFeatureGuard = {
      entry: { state: RegistryEntryState.Bound, value: colorAdjustmentFeatureGuard },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeatureGuard',
      shape: 'slot',
    };
    getWgpuRenderStateRuntime(screen).registries.renderRootGuard = {
      entry: { state: RegistryEntryState.Bound, value: renderRootGuard },
      onMiss: 'Disabled',
      registry: 'RenderRootGuard',
      shape: 'slot',
    };
    getWgpuRenderStateRuntime(screen).registries.renderEffects = withRegistryTableEntry(
      getWgpuRenderStateRuntime(screen).registries.renderEffects,
      'acme.Effect',
      effectRunner as never,
    );
    getWgpuRenderStateRuntime(screen).wgpuRenderTextureCache = new WeakMap();

    const offscreen = createWgpuOffscreenRenderState(screen);
    const screenRuntime = getWgpuRenderStateRuntime(screen);
    const offscreenRuntime = getWgpuRenderStateRuntime(offscreen);

    expect(offscreen.device).toBe(screen.device);
    expect(offscreen.surface).toBe(screen.surface);
    expect(offscreenRuntime.pipelineCache).toBe(screenRuntime.pipelineCache);
    expect(offscreenRuntime.textureCache).toBe(screenRuntime.textureCache);
    expect(offscreenRuntime.wgpuRenderTextureCache).toBe(screenRuntime.wgpuRenderTextureCache);
    expect(offscreenRuntime.uniformBindGroupLayout).toBe(screenRuntime.uniformBindGroupLayout);
    expect(offscreenRuntime.uniformBuffer).not.toBe(screenRuntime.uniformBuffer);
    expect(offscreenRuntime.registries.renderers).toBe(screenRuntime.registries.renderers);
    expect(offscreenRuntime.registries).not.toBe(screenRuntime.registries);
    expect(offscreenRuntime.registries.colorAdjustmentFeature).toBe(screenRuntime.registries.colorAdjustmentFeature);
    expect(getWgpuColorAdjustmentMaterialFeature(offscreen)).toBe(colorAdjustmentFeature);
    expect(offscreenRuntime.registries.colorAdjustmentFeatureGuard).toBe(
      screenRuntime.registries.colorAdjustmentFeatureGuard,
    );
    expect(getWgpuColorAdjustmentMaterialFeatureGuard(offscreen)).toBe(colorAdjustmentFeatureGuard);
    const sharedColorFeatureGuard = offscreenRuntime.registries.colorAdjustmentFeatureGuard;
    screenRuntime.registries.colorAdjustmentFeatureGuard = undefined;
    expect(getWgpuColorAdjustmentMaterialFeatureGuard(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentFeatureGuard).toBe(sharedColorFeatureGuard);
    expect(getWgpuColorAdjustmentMaterialFeatureGuard(offscreen)).toBe(colorAdjustmentFeatureGuard);
    const sharedColorFeature = offscreenRuntime.registries.colorAdjustmentFeature;
    screenRuntime.registries.colorAdjustmentFeature = undefined;
    expect(getWgpuColorAdjustmentMaterialFeature(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentFeature).toBe(sharedColorFeature);
    expect(getWgpuColorAdjustmentMaterialFeature(offscreen)).toBe(colorAdjustmentFeature);
    expect(offscreenRuntime.registries.colorAdjustments).toBe(screenRuntime.registries.colorAdjustments);
    expect(offscreenRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(
      screenRuntime.registries.colorAdjustmentUnsupportedGuard,
    );
    expect(getColorAdjustmentUnsupportedGuard(offscreen)).not.toBeNull();
    const sharedUnsupportedGuard = offscreenRuntime.registries.colorAdjustmentUnsupportedGuard;
    screenRuntime.registries.colorAdjustmentUnsupportedGuard = undefined;
    expect(getColorAdjustmentUnsupportedGuard(screen)).toBeNull();
    expect(offscreenRuntime.registries.colorAdjustmentUnsupportedGuard).toBe(sharedUnsupportedGuard);
    expect(getColorAdjustmentUnsupportedGuard(offscreen)).not.toBeNull();
    expect(offscreenRuntime.registries.renderRootGuard).toBe(screenRuntime.registries.renderRootGuard);
    expect(offscreenRuntime.registries.renderRootGuard?.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: renderRootGuard,
    });
    const sharedRenderRootGuard = offscreenRuntime.registries.renderRootGuard;
    screenRuntime.registries.renderRootGuard = undefined;
    expect(screenRuntime.registries.renderRootGuard).toBeUndefined();
    expect(offscreenRuntime.registries.renderRootGuard).toBe(sharedRenderRootGuard);
    expect(
      getRegistryTableEntry(
        offscreenRuntime.registries.renderRootGuard!,
        offscreenRuntime.registries.renderRootGuard!.registry,
      ),
    ).toBe(renderRootGuard);
    expect(offscreenRuntime.registries.compressedTextureDecoder).toBe(
      screenRuntime.registries.compressedTextureDecoder,
    );
    expect(offscreenRuntime.registries.compressedTextureUpload).toBe(screenRuntime.registries.compressedTextureUpload);
    expect(offscreenRuntime.registries.customMaterialShaders).toBe(screenRuntime.registries.customMaterialShaders);
    expect(offscreenRuntime.registries.materialRenderers).toBe(screenRuntime.registries.materialRenderers);
    expect(offscreenRuntime.registries.meshMaterialRenderers).toBe(screenRuntime.registries.meshMaterialRenderers);
    expect(offscreenRuntime.registries.modifierSnippets).toBe(screenRuntime.registries.modifierSnippets);
    expect(offscreenRuntime.registries.modifierSnippetRevision).toBe(screenRuntime.registries.modifierSnippetRevision);
    expect(offscreenRuntime.registries.renderEffects).toBe(screenRuntime.registries.renderEffects);
    expect(offscreenRuntime.registries.shapeRasterizer).toBe(screenRuntime.registries.shapeRasterizer);
    expect(offscreenRuntime.registries.strokeTessellator).toBe(screenRuntime.registries.strokeTessellator);
    expect(offscreenRuntime.registries.textureResolvers).toBe(screenRuntime.registries.textureResolvers);
    expect(offscreenRuntime.registries.velocityWriters).toBe(screenRuntime.registries.velocityWriters);
    expect(offscreenRuntime.registries.effectPaddingResolvers).toBe(screenRuntime.registries.effectPaddingResolvers);
    expect(getRegistryTableEntry(offscreenRuntime.registries.renderers, 'acme.Node')).toBe(renderer);
    expect(getRegistryTableEntry(offscreenRuntime.registries.materialRenderers, 'acme.Material')).toBe(
      materialRenderer,
    );
    expect(getRegistryTableEntry(offscreenRuntime.registries.textureResolvers, 'acme.Texture')).toBe(textureResolver);
    expect(getRegistryTableEntry(offscreenRuntime.registries.renderEffects, 'acme.Effect')).toBe(effectRunner);
    expect(getPaddingResolver(offscreen, 'acme.Effect')).toBe(paddingResolver);
  });

  it('owns an independent encoder and proxy tree', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const root = createDisplayObject();
    registerRenderer(offscreen, root.kind, { createData: () => createEntity({}), submit: vi.fn() });
    prepareScene2DRender(offscreen, root);
    beginWgpuFrame(screen);
    beginWgpuFrame(offscreen);

    expect(getRenderStateRuntime(offscreen).renderProxyMap).not.toBe(getRenderStateRuntime(screen).renderProxyMap);
    expect(getWgpuRenderStateRuntime(offscreen).commandEncoder).not.toBe(
      getWgpuRenderStateRuntime(screen).commandEncoder,
    );
  });

  it('destroys derived renderer data and its own uniform ring without freeing the screen ring', async () => {
    const screen = await createWgpuRenderStateForTest();
    const root = createDisplayObject();
    const destroyData = vi.fn();
    registerRenderer(screen, root.kind, {
      createData: () => createEntity({}),
      destroyData,
      submit: vi.fn(),
    });
    const offscreen = createWgpuOffscreenRenderState(screen);
    prepareScene2DRender(offscreen, root);
    const screenDestroy = vi.spyOn(getWgpuRenderStateRuntime(screen).uniformBuffer, 'destroy');
    const offscreenDestroy = vi.spyOn(getWgpuRenderStateRuntime(offscreen).uniformBuffer, 'destroy');

    destroyWgpuRenderState(offscreen);

    expect(destroyData).toHaveBeenCalledOnce();
    expect(offscreenDestroy).toHaveBeenCalledOnce();
    expect(screenDestroy).not.toHaveBeenCalled();
  });

  it('requires explicit re-copy for renderers and padding registered after derivation', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const renderer = { createData: () => null, submit: vi.fn() };
    const paddingResolver = vi.fn(() => ({ bottom: 2, left: 2, right: 2, top: 2 }));
    registerRenderer(screen, 'acme.LateNode', renderer);
    registerPaddingResolver(screen, 'acme.LateEffect', paddingResolver);

    expect(hasRegistryTableEntry(getRenderStateRuntime(offscreen).registries.renderers, 'acme.LateNode')).toBe(false);
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBeNull();

    copyAllRenderersFromRenderState(offscreen, screen);
    copyWgpuRenderStateRegistrations(offscreen, screen);
    expect(getRegistryTableEntry(getRenderStateRuntime(offscreen).registries.renderers, 'acme.LateNode')).toBe(
      renderer,
    );
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBe(paddingResolver);
  });
});

describe('createWgpuRenderState', () => {
  it('keeps exact caller-owned handles usable through every shared-state teardown', async () => {
    const owner = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    const acquisition = {
      context: owner.context,
      device: owner.device,
      format: owner.format,
      ownership: 'caller',
      surface: owner.surface,
    } as const;
    let contextUsable = true;
    let deviceUsable = true;
    const originalCreateBuffer = acquisition.device.createBuffer.bind(acquisition.device);
    const originalGetCurrentTexture = acquisition.context.getCurrentTexture.bind(acquisition.context);
    const createBuffer = vi.spyOn(acquisition.device, 'createBuffer').mockImplementation((descriptor) => {
      if (!deviceUsable) throw new Error('caller device was destroyed');
      return originalCreateBuffer(descriptor);
    });
    const getCurrentTexture = vi.spyOn(acquisition.context, 'getCurrentTexture').mockImplementation(() => {
      if (!contextUsable) throw new Error('caller context was unconfigured');
      return originalGetCurrentTexture();
    });
    const unconfigure = vi.spyOn(acquisition.context, 'unconfigure').mockImplementation(() => {
      contextUsable = false;
    });
    const destroy = vi.spyOn(acquisition.device, 'destroy').mockImplementation(() => {
      deviceUsable = false;
    });
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      get(): never {
        throw new Error('host getter failed');
      },
    });

    try {
      const state = createWgpuRenderState(acquisition);
      const offscreen = createWgpuOffscreenRenderState(state);
      expect(state.context).toBe(acquisition.context);
      expect(state.device).toBe(acquisition.device);
      expect(state.format).toBe(acquisition.format);
      expect(offscreen.context).toBe(acquisition.context);
      expect(offscreen.device).toBe(acquisition.device);
      expect(offscreen.format).toBe(acquisition.format);
      const createBufferCallsBeforeTeardown = createBuffer.mock.calls.length;
      const getCurrentTextureCallsBeforeTeardown = getCurrentTexture.mock.calls.length;
      destroyWgpuRenderState(state);
      destroyWgpuRenderState(offscreen);
      expect(unconfigure).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();

      const buffer = acquisition.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST });
      expect(buffer.size).toBe(4);
      expect(acquisition.context.getCurrentTexture().createView()).toBeDefined();
      expect(createBuffer).toHaveBeenCalledTimes(createBufferCallsBeforeTeardown + 1);
      expect(getCurrentTexture).toHaveBeenCalledTimes(getCurrentTextureCallsBeforeTeardown + 1);
      buffer.destroy();
    } finally {
      installWgpuMock();
      destroyWgpuRenderState(owner);
    }
  });

  it('returns a render state with device and context', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.device).toBeDefined();
    expect(state.context).toBeDefined();
  });

  it('sets allowSmoothing to true by default', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.allowSmoothing).toBe(true);
  });

  it('initialises uniform ring buffer', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.uniformBuffer).toBeDefined();
    expect(runtime.uniformData).toBeInstanceOf(Float32Array);
    expect(runtime.uniformOffset).toBe(0);
  });

  // C5: the state exposes the surface as SIZE ONLY. Asserting `instanceof HTMLCanvasElement` here would
  // re-impose the DOM dependency the surface type exists to remove — that the web backend's surface happens
  // to be a canvas is a property of that backend, pinned in wgpuHost.test.ts, not of the state contract.
  it('exposes the presentation surface as live size, carrying no DOM member', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(typeof state.surface.width).toBe('number');
    expect(typeof state.surface.height).toBe('number');
    expect(Object.keys(state.surface as object).filter((key) => key !== 'width' && key !== 'height')).toEqual([]);
  });

  it('starts with null renderPass and commandEncoder', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.commandEncoder).toBeNull();
  });
});

describe('createWgpuRenderStateFromCanvasElement', () => {
  it('acquires flight-owned handles and releases them when the state is destroyed', async () => {
    const owner = await createWgpuRenderStateForTest();
    const acquisition = { ...ownerAcquisition(owner), ownership: 'flight' } as const;
    const released: Readonly<WgpuHostAcquisition>[] = [];
    setWgpuHostBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn((held: Readonly<WgpuHostAcquisition>) => released.push(held)),
    });

    const state = await createWgpuRenderStateFromCanvasElement(document.createElement('canvas'));
    destroyWgpuRenderState(state);

    expect(released).toEqual([acquisition]);
    setWgpuHostBackend(null);
    destroyWgpuRenderState(owner);
  });

  it('forwards the acquisition options, which the render options no longer carry', async () => {
    const owner = await createWgpuRenderStateForTest();
    const acquire = vi.fn(async () => ({ ...ownerAcquisition(owner), ownership: 'flight' }) as const);
    setWgpuHostBackend({ acquire, isSupported: vi.fn(() => true), release: vi.fn() });
    const canvas = document.createElement('canvas');

    const state = await createWgpuRenderStateFromCanvasElement(canvas, {
      format: 'rgba8unorm',
      powerPreference: 'low-power',
    });

    expect(acquire).toHaveBeenCalledWith(canvas, { format: 'rgba8unorm', powerPreference: 'low-power' });
    destroyWgpuRenderState(state);
    setWgpuHostBackend(null);
    destroyWgpuRenderState(owner);
  });
});

describe('createWgpuRenderStateRuntime', () => {
  it('returns a runtime with the base binding slot and empty named registration tables', () => {
    const runtime = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));
    expect(runtime.binding).toBeNull();
    expect(runtime.registries.customMaterialShaders).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'WgpuCustomMaterialShader',
      shape: 'keyed',
    });
    expect(runtime.registries.customMaterialShaders.entries.size).toBe(0);
    expect(runtime.registries.materialRenderers).toMatchObject({
      onMiss: 'StandardMaterial',
      registry: 'WgpuMaterialRenderer',
      shape: 'keyed',
    });
    expect(runtime.registries.materialRenderers.entries.size).toBe(0);
    expect(runtime.registries.meshMaterialRenderers).toMatchObject({
      onMiss: 'StandardMaterial',
      registry: 'WgpuMeshMaterialRenderer',
      shape: 'keyed',
    });
    expect(runtime.registries.meshMaterialRenderers.entries.size).toBe(0);
    expect(runtime.registries.modifierSnippets).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'WgpuModifierSnippet',
      shape: 'keyed',
    });
    expect(runtime.registries.modifierSnippets.entries.size).toBe(0);
    expect(runtime.registries.modifierSnippetRevision).toBe(0);
    expect(runtime.registries.renderEffects).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'WgpuRenderEffect',
      shape: 'keyed',
    });
    expect(runtime.registries.compressedTextureDecoder).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'WgpuCompressedTextureDecoder',
      shape: 'slot',
    });
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.compressedTextureUpload).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'WgpuCompressedTextureUpload',
      shape: 'slot',
    });
    expect(runtime.registries.shapeRasterizer).toEqual({
      entry: null,
      onMiss: 'Unregistered',
      registry: 'WgpuShapeRasterizer',
      shape: 'slot',
    });
    expect(runtime.registries.strokeTessellator).toEqual({
      entry: null,
      onMiss: 'Rasterize',
      registry: 'StrokeTessellator',
      shape: 'slot',
    });
    expect(runtime.registries.velocityWriters).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'WgpuVelocityWriter',
      shape: 'keyed',
    });
    expect(runtime.registries.velocityWriters.entries.size).toBe(0);
  });

  it('shares the device tier when two runtimes are built from the same WgpuDeviceState', () => {
    const deviceState = createWgpuDeviceState({} as GPUDevice);
    const runtimeA = createWgpuRenderStateRuntime(deviceState);
    const runtimeB = createWgpuRenderStateRuntime(deviceState);

    const sampler = {} as GPUSampler;
    runtimeA.linearSampler = sampler;
    expect(runtimeB.linearSampler).toBe(sampler);

    const sampler2 = {} as GPUSampler;
    runtimeB.linearSampler = sampler2;
    expect(runtimeA.linearSampler).toBe(sampler2);
  });

  it('keeps separate device tiers when two runtimes are built from different WgpuDeviceStates', () => {
    const runtimeA = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));
    const runtimeB = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));

    runtimeA.linearSampler = {} as GPUSampler;
    expect(runtimeB.linearSampler).toBeUndefined();
  });
});

describe('destroyWgpuRenderState', () => {
  it('releases a Flight-owned acquisition once after its last derived state', async () => {
    const state = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(state);
    const unconfigure = vi.spyOn(state.context, 'unconfigure');
    const destroy = vi.spyOn(state.device, 'destroy');

    destroyWgpuRenderState(state);
    destroyWgpuRenderState(state);
    expect(unconfigure).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();

    destroyWgpuRenderState(offscreen);
    destroyWgpuRenderState(offscreen);
    expect(unconfigure).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('destroys the state-owned uniform buffer', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const destroy = vi.spyOn(runtime.uniformBuffer, 'destroy');

    destroyWgpuRenderState(state);

    expect(destroy).toHaveBeenCalled();
  });

  it('does not throw on a fresh state with no lazily-created buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => destroyWgpuRenderState(state)).not.toThrow();
  });

  it('shares the device tier across screen and offscreen states', async () => {
    const state = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const offscreenRuntime = getWgpuRenderStateRuntime(offscreen);

    const sampler = {} as GPUSampler;
    runtime.linearSampler = sampler;
    expect(offscreenRuntime.linearSampler).toBe(sampler);

    destroyWgpuRenderState(offscreen);
    destroyWgpuRenderState(state);
  });

  it('invokes registered teardown callbacks when the last reference is destroyed', async () => {
    const state = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(state);
    const teardown = vi.fn();
    registerWgpuDeviceTeardown(state, teardown);

    destroyWgpuRenderState(state);
    expect(teardown).not.toHaveBeenCalled();

    destroyWgpuRenderState(offscreen);
    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(state.device);
  });

  it('does not invoke teardowns when references remain', async () => {
    const state = await createWgpuRenderStateForTest();
    createWgpuOffscreenRenderState(state);
    const teardown = vi.fn();
    registerWgpuDeviceTeardown(state, teardown);

    destroyWgpuRenderState(state);
    expect(teardown).not.toHaveBeenCalled();
  });
});

describe('getWgpuColorAdjustmentMaterialFeature', () => {
  it('resolves only a bound feature entry', async () => {
    const state = await createWgpuRenderStateForTest();
    const feature: WgpuColorAdjustmentMaterialFeature = {
      fragmentShaderChunk: '',
      matrixFragmentShaderChunk: '',
      record: vi.fn(),
      resolveFlush: vi.fn(() => null),
    };
    const runtime = getWgpuRenderStateRuntime(state);

    expect(getWgpuColorAdjustmentMaterialFeature(state)).toBeNull();
    runtime.registries.colorAdjustmentFeature = {
      entry: { state: RegistryEntryState.Bound, value: feature },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeature',
      shape: 'slot',
    };
    expect(getWgpuColorAdjustmentMaterialFeature(state)).toBe(feature);
    runtime.registries.colorAdjustmentFeature = {
      ...runtime.registries.colorAdjustmentFeature,
      entry: { state: RegistryEntryState.Tombstoned },
    };
    expect(getWgpuColorAdjustmentMaterialFeature(state)).toBeNull();
  });
});

describe('getWgpuColorAdjustmentMaterialFeatureGuard', () => {
  it('resolves only a bound guard entry', async () => {
    const state = await createWgpuRenderStateForTest();
    const guard: WgpuColorAdjustmentMaterialFeatureGuard = vi.fn();
    const runtime = getWgpuRenderStateRuntime(state);

    expect(getWgpuColorAdjustmentMaterialFeatureGuard(state)).toBeNull();
    runtime.registries.colorAdjustmentFeatureGuard = {
      entry: { state: RegistryEntryState.Bound, value: guard },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeatureGuard',
      shape: 'slot',
    };
    expect(getWgpuColorAdjustmentMaterialFeatureGuard(state)).toBe(guard);
    runtime.registries.colorAdjustmentFeatureGuard = {
      ...runtime.registries.colorAdjustmentFeatureGuard,
      entry: { state: RegistryEntryState.Tombstoned },
    };
    expect(getWgpuColorAdjustmentMaterialFeatureGuard(state)).toBeNull();
  });
});

describe('getWgpuRenderStateRuntime', () => {
  it('returns the runtime attached by createWgpuRenderState', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime).toBeDefined();
    expect(runtime.uniformBuffer).toBeDefined();
  });

  it('resolves the same runtime object on repeated calls', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderStateRuntime(state)).toBe(getWgpuRenderStateRuntime(state));
  });
});

describe('getWgpuSampler', () => {
  it('caches a sampler per filter+wrap+mip+anisotropy config and reuses it (one createSampler)', async () => {
    const state = await createWgpuRenderStateForTest();
    const a = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat');
    const b = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat');
    expect(a).toBe(b);
    // The cache is keyed by a packed NUMBER (no per-call string allocation), and one config caches once.
    expect([...getWgpuRenderStateRuntime(state).samplerCache.keys()].every((k) => typeof k === 'number')).toBe(true);
    expect(getWgpuRenderStateRuntime(state).samplerCache.size).toBe(1);
  });

  it('returns a distinct sampler for a different wrap or filter', async () => {
    const state = await createWgpuRenderStateForTest();
    const repeat = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat');
    const clamp = getWgpuSampler(state, 'linear', 'linear', 'clamp-to-edge', 'clamp-to-edge');
    const nearest = getWgpuSampler(state, 'nearest', 'nearest', 'repeat', 'repeat');
    expect(repeat).not.toBe(clamp);
    expect(repeat).not.toBe(nearest);
  });

  it('keys the mip filter separately so a trilinear sampler differs from a non-mip one', async () => {
    const state = await createWgpuRenderStateForTest();
    const noMip = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat');
    const trilinear = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat', 'linear');
    expect(noMip).not.toBe(trilinear);
    expect(getWgpuRenderStateRuntime(state).samplerCache.size).toBe(2);
  });

  it('forces linear filtering and a linear mip filter when anisotropy exceeds 1', async () => {
    // WebGPU rejects maxAnisotropy > 1 unless min/mag/mip are all linear, so a nearest+aniso request
    // collapses to the SAME sampler as the explicit linear/trilinear anisotropic request.
    const state = await createWgpuRenderStateForTest();
    const collapsed = getWgpuSampler(state, 'nearest', 'nearest', 'clamp-to-edge', 'clamp-to-edge', undefined, 8);
    const explicit = getWgpuSampler(state, 'linear', 'linear', 'clamp-to-edge', 'clamp-to-edge', 'linear', 8);
    expect(collapsed).toBe(explicit);
  });

  it('floors and clamps the anisotropy level into the cache key', async () => {
    const state = await createWgpuRenderStateForTest();
    const a = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat', 'linear', 4.9);
    const b = getWgpuSampler(state, 'linear', 'linear', 'repeat', 'repeat', 'linear', 4);
    expect(a).toBe(b);
    expect(getWgpuRenderStateRuntime(state).samplerCache.size).toBe(1);
  });

  it('keeps independent minification and magnification filters', async () => {
    const state = await createWgpuRenderStateForTest();
    const createSampler = vi.spyOn(state.device, 'createSampler');
    getWgpuSampler(state, 'nearest', 'linear', 'repeat', 'repeat');
    expect(createSampler).toHaveBeenLastCalledWith(
      expect.objectContaining({ minFilter: 'nearest', magFilter: 'linear' }),
    );
  });
});

describe('isWgpuSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWgpuSupported()).toBe(true);
  });

  it('returns false when navigator.gpu throws', () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      get(): never {
        throw new Error('host getter failed');
      },
    });
    try {
      expect(isWgpuSupported()).toBe(false);
    } finally {
      installWgpuMock();
    }
  });
});

describe('releaseWgpuAcquisition', () => {
  // Unconditional on purpose: this is the CALLER asking. Flight's own paths refuse to release caller-owned
  // handles, so if this verb deferred to the same policy the caller would have no way to end their life.
  it('releases caller-owned handles, which Flight itself never does', async () => {
    const owner = await createWgpuRenderStateForTest();
    const acquisition = { ...ownerAcquisition(owner), ownership: 'caller' } as const;
    const released: Readonly<WgpuHostAcquisition>[] = [];
    setWgpuHostBackend({
      acquire: vi.fn(async () => acquisition),
      isSupported: vi.fn(() => true),
      release: vi.fn((held: Readonly<WgpuHostAcquisition>) => released.push(held)),
    });

    releaseWgpuAcquisition(acquisition);

    expect(released).toEqual([acquisition]);
    setWgpuHostBackend(null);
    destroyWgpuRenderState(owner);
  });
});

function ownerAcquisition(owner: WgpuRenderState): Omit<WgpuHostAcquisition, 'ownership'> {
  return { context: owner.context, device: owner.device, format: owner.format, surface: owner.surface };
}

describe('resolveWgpuApplyBlendMode', () => {
  it('returns a hook installed directly on the state', async () => {
    const state = await createWgpuRenderStateForTest();
    const hook = vi.fn();
    state.applyBlendMode = hook;
    expect(resolveWgpuApplyBlendMode(state)).toBe(hook);
  });
});

// ★ OWNERSHIP LIFECYCLE. Flight decides whether an acquisition is released; the backend only carries out
// the teardown. Each backend here would really destroy the handles if asked, so "not released" is a fact
// about Flight's decision rather than about a spy that could not have destroyed anything.
describe('wgpu acquisition lifecycle', () => {
  const destroyingBackend = (
    acquisition: Readonly<WgpuHostAcquisition>,
  ): { backend: WgpuHostBackend; released: Readonly<WgpuHostAcquisition>[] } => {
    const released: Readonly<WgpuHostAcquisition>[] = [];
    return {
      backend: {
        acquire: vi.fn(async () => acquisition),
        isSupported: vi.fn(() => true),
        release: vi.fn((held: Readonly<WgpuHostAcquisition>) => {
          released.push(held);
          held.device.destroy();
        }),
      },
      released,
    };
  };

  it('L1: releases a flight-owned acquisition exactly once, after the last sharer, in either order', async () => {
    for (const destroyOffscreenFirst of [false, true]) {
      const owner = await createWgpuRenderStateForTest();
      const acquisition = { ...ownerAcquisition(owner), ownership: 'flight' } as const;
      const { backend, released } = destroyingBackend(acquisition);
      setWgpuHostBackend(backend);

      const state = createWgpuRenderState(acquisition);
      const offscreen = createWgpuOffscreenRenderState(state);
      const first = destroyOffscreenFirst ? offscreen : state;
      const second = destroyOffscreenFirst ? state : offscreen;

      destroyWgpuRenderState(first);
      expect(released, 'released before the last sharer was destroyed').toEqual([]);
      destroyWgpuRenderState(second);
      expect(released).toEqual([acquisition]);

      setWgpuHostBackend(null);
      destroyWgpuRenderState(owner);
    }
  });

  it('L2: never releases a caller-owned acquisition, in either destroy order', async () => {
    for (const destroyOffscreenFirst of [false, true]) {
      const owner = await createWgpuRenderStateForTest();
      const acquisition = { ...ownerAcquisition(owner), ownership: 'caller' } as const;
      const { backend, released } = destroyingBackend(acquisition);
      setWgpuHostBackend(backend);

      const state = createWgpuRenderState(acquisition);
      const offscreen = createWgpuOffscreenRenderState(state);
      destroyWgpuRenderState(destroyOffscreenFirst ? offscreen : state);
      destroyWgpuRenderState(destroyOffscreenFirst ? state : offscreen);

      expect(released).toEqual([]);
      // L5: the handles still work, which is what the caller actually depends on.
      expect(acquisition.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST }).size).toBe(4);

      setWgpuHostBackend(null);
      destroyWgpuRenderState(owner);
    }
  });

  it('L3: destroying the same state twice releases once', async () => {
    const owner = await createWgpuRenderStateForTest();
    const acquisition = { ...ownerAcquisition(owner), ownership: 'flight' } as const;
    const { backend, released } = destroyingBackend(acquisition);
    setWgpuHostBackend(backend);

    const state = createWgpuRenderState(acquisition);
    destroyWgpuRenderState(state);
    destroyWgpuRenderState(state);

    expect(released).toEqual([acquisition]);
    setWgpuHostBackend(null);
    destroyWgpuRenderState(owner);
  });

  it('L4: routes release to the backend that acquired, not whichever is installed at destroy time', async () => {
    const owner = await createWgpuRenderStateForTest();
    const acquisition = { ...ownerAcquisition(owner), ownership: 'flight' } as const;
    const acquiring = destroyingBackend(acquisition);
    const replacement = destroyingBackend(acquisition);
    setWgpuHostBackend(acquiring.backend);

    const state = createWgpuRenderState(acquisition);
    setWgpuHostBackend(replacement.backend);
    destroyWgpuRenderState(state);

    expect(acquiring.released).toEqual([acquisition]);
    expect(replacement.released, 'released through the backend installed later').toEqual([]);

    setWgpuHostBackend(null);
    destroyWgpuRenderState(owner);
  });
});

// ★ THE PRESENTATION-SURFACE CONTRACT. `WgpuPresentationSurface` exists so the WGPU path can size itself
// without an `HTMLCanvasElement`, and its whole risk is a provider that captures the size once. A snapshot
// would satisfy every construction-time assertion in this repo and fail only on a resize, so liveness is
// tested here through a NON-DOM provider whose values change behind getters — which also proves the second
// half of the contract, that nothing on the path reads a DOM member.
describe('WgpuPresentationSurface', () => {
  it('C1/C2: drives every size consumer from a live, non-DOM, size-only provider', async () => {
    const owner = await createWgpuRenderStateForTest();
    let width = 800;
    let height = 600;
    const surface: WgpuPresentationSurface = {
      get height() {
        return height;
      },
      get width() {
        return width;
      },
    };
    const acquisition = {
      context: owner.context,
      device: owner.device,
      format: owner.format,
      ownership: 'caller',
      surface,
    } as const;
    const canvas = document.createElement('canvas');

    const state = createWgpuRenderState(acquisition);
    expect(getWgpuSurfaceRenderExtent(state)).toEqual({ width: 800, height: 600 });

    width = 320;
    height = 240;

    // Every consumer re-reads: a captured `{ width, height }` would still answer 800x600 here.
    expect(state.surface.width).toBe(320);
    expect(state.surface.height).toBe(240);
    expect(getWgpuSurfaceRenderExtent(state)).toEqual({ width: 320, height: 240 });

    destroyWgpuRenderState(state);
    destroyWgpuRenderState(owner);
  });

  it('C4: accepts an HTMLCanvasElement structurally, so the web path needs no wrapper', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const surface: WgpuPresentationSurface = canvas;
    expect(surface.width).toBe(128);
    expect(surface.height).toBe(64);
  });
});
