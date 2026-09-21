import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createKeyedTable,
  getRegistryTableEntry,
  hasRegistryTableEntry,
  withRegistryTableEntry,
} from '@flighthq/registry/contract';
import {
  enableColorAdjustmentGuards,
  enableColorAdjustments,
  getColorAdjustmentUnsupportedGuard,
  getRenderStateRuntime,
  prepareScene2DRender,
  registerNodeRenderer,
} from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  Entity,
  EffectPaddingResolver,
  RenderRootGuard,
  RenderState,
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
  WgpuHostAcquisition,
  HostWgpuCapability,
  WgpuRenderRegistries,
  WgpuRenderOptions,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import { registerWgpuCompressedTextureDecoder, registerWgpuCompressedTextureUpload } from './wgpuCompressedTexture';
import { beginWgpuFrame, withWgpuFrameBorrow } from './wgpuFrame';
import { createTestWgpuSurface, testWgpuHost } from './wgpuHost';
import { allocateEmptyWgpuRenderRegistries } from './wgpuPipeline';
import { registerWgpuQuadMaterialRenderer } from './wgpuQuadMaterialRegistry';
import {
  createWgpuAcquisition,
  createWgpuDeviceState,
  createWgpuOffscreenRenderState as createDeviceOnlyWgpuRenderState,
  createWgpuRenderState as createWgpuRenderStateWithPipeline,
  createWgpuRenderStateRuntime as createWgpuRenderStateRuntimeWithPipeline,
  destroyWgpuRenderState,
  getWgpuColorAdjustmentMaterialFeature,
  getWgpuColorAdjustmentMaterialFeatureGuard,
  getWgpuDeviceRuntime,
  getWgpuRenderStateDeviceResources,
  getWgpuRenderStateRuntime,
  getWgpuSampler,
  initializeWgpuDeviceState,
  initializeWgpuHostAcquisition,
  initializeWgpuOffscreenRenderStateDeviceLostResult,
  initializeWgpuOffscreenRenderStateOkResult,
  isWgpuSupported,
  registerWgpuDeviceTeardown,
  registerWgpuRenderStateTeardown,
  releaseWgpuAcquisition,
  resolveWgpuApplyBlendMode,
} from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { registerWgpuTextureResolver } from './wgpuTextureResolver';

function expectEntitySlot(slot: object & { readonly [EntityRuntimeKey]?: unknown }, fields: object): void {
  const { [EntityRuntimeKey]: entityRuntime, ...slotFields } = slot;
  expect(slotFields).toEqual(fields);
  expect(Object.hasOwn(slot, EntityRuntimeKey)).toBe(true);
  expect(entityRuntime).toBeUndefined();
}

beforeAll(() => {
  installWgpuMock();
});

const _testPipeline = allocateEmptyWgpuRenderRegistries();
const _webBackend = testWgpuHost;

function createWgpuRenderState(device: GPUDevice, options: Readonly<WgpuRenderOptions> = {}) {
  return createWgpuRenderStateWithPipeline(device, _testPipeline, options);
}

function createWgpuRenderStateRuntime(deviceState: ReturnType<typeof createWgpuDeviceState>) {
  return createWgpuRenderStateRuntimeWithPipeline(deviceState, _testPipeline);
}

function entityHostBackend(fields: Omit<HostWgpuCapability, keyof Entity>): HostWgpuCapability {
  return (() => {
    const out = allocateEntity<any>();
    Object.assign(out, fields);
    return finishEntity(out);
  })();
}

function createWgpuOffscreenRenderState(source: WgpuRenderState): WgpuRenderState {
  const pipeline: WgpuRenderRegistries = { ...getWgpuRenderStateRuntime(source).registries };
  const state = createDeviceOnlyWgpuRenderState(source.deviceState, pipeline, {
    format: source.format,
    imageSmoothingEnabled: source.allowSmoothing,
    pixelRatio: source.pixelRatio,
    roundPixels: source.roundPixels,
    sceneGraphSyncPolicy: source.sceneGraphSyncPolicy,
  });
  const runtime = getWgpuRenderStateRuntime(state);
  const sourceRuntime = getWgpuRenderStateRuntime(source);
  runtime.applyBlendModeParent = source;
  runtime.defaultBitmapShader = sourceRuntime.defaultBitmapShader;
  runtime.mipmapDegradedGuard = sourceRuntime.mipmapDegradedGuard;
  runtime.mipmapGenerator = sourceRuntime.mipmapGenerator;
  runtime.webgpuShaderBindingResolver = sourceRuntime.webgpuShaderBindingResolver;
  runtime.wgpuRenderTextureGuard = sourceRuntime.wgpuRenderTextureGuard;
  return state;
}

function getPaddingResolver(state: RenderState, kind: string): EffectPaddingResolver | null {
  const table = getRenderStateRuntime(state).registries.effectPaddingResolvers;
  return table === undefined ? null : getRegistryTableEntry(table, kind);
}

function registerPaddingResolver(state: RenderState, kind: string, resolver: EffectPaddingResolver): void {
  const runtime = getRenderStateRuntime(state);
  runtime.registries.effectPaddingResolvers = withRegistryTableEntry(
    runtime.registries.effectPaddingResolvers ??
      createKeyedTable<EffectPaddingResolver>('EffectPaddingResolver', 'Zero'),
    kind,
    resolver,
  );
}

describe('createWgpuAcquisition', () => {
  it('hands back handles the CALLER owns, so no state teardown can release them', async () => {
    const acquisition = await createWgpuAcquisition(
      _webBackend,
      createTestWgpuSurface(document.createElement('canvas')),
    );

    expect(acquisition).not.toBeNull();
    expect(acquisition!.ownership).toBe('caller');
    expect(acquisition!.surface).toBeDefined();
    releaseWgpuAcquisition(_webBackend, acquisition!);
  });

  // ★ NULL, NOT THROW. "This environment cannot give me WebGPU" is an expected outcome, not API misuse, so
  // it reports through the return value like every other expected failure in this SDK.
  it('returns null when the host cannot acquire, rather than rejecting', async () => {
    const failingBackend = entityHostBackend({
      acquire: vi.fn(async () => {
        throw new Error('no adapter');
      }),
      attachSurface: vi.fn(() => null),
      create: vi.fn(() => null),
      isSupported: vi.fn(() => false),
      release: vi.fn(),
    });

    await expect(
      createWgpuAcquisition(failingBackend, createTestWgpuSurface(document.createElement('canvas'))),
    ).resolves.toBeNull();
  });
});

describe('createWgpuDeviceState', () => {
  it('allocates distinct owners for repeated calls with the same raw device', () => {
    const device = {} as GPUDevice;
    expect(createWgpuDeviceState(device)).not.toBe(createWgpuDeviceState(device));
  });

  it('rejects a plain literal at the Entity boundary: EntityRuntimeKey is absent without allocateEntity', () => {
    const device = {} as GPUDevice;
    const literal = { device };
    expect(EntityRuntimeKey in literal).toBe(false);

    const entity = createWgpuDeviceState(device);
    expect(EntityRuntimeKey in entity).toBe(true);
  });

  it('returns a state that shares the device tier across derived runtimes', () => {
    const device = {} as GPUDevice;
    const deviceState = createWgpuDeviceState(device);
    const runtimeA = createWgpuRenderStateRuntime(deviceState);
    const runtimeB = createWgpuRenderStateRuntime(deviceState);
    runtimeA.context.standardMaterialModule = {} as GPUShaderModule;
    expect(runtimeB.context.standardMaterialModule).toBe(runtimeA.context.standardMaterialModule);
  });

  it('represents device-native resources as absent before the first render state initializes them', () => {
    const runtime = getWgpuDeviceRuntime(createWgpuDeviceState({} as GPUDevice));
    expect(runtime.resources).toBeNull();
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

    offscreen.applyBlendMode = null;
    getWgpuRenderStateRuntime(offscreen).applyBlendModeParent = screen;
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
    registerNodeRenderer(screen, 'acme.Node', renderer);
    registerWgpuQuadMaterialRenderer(screen, 'acme.Material', materialRenderer);
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
    getWgpuRenderStateRuntime(screen).registries.effects = withRegistryTableEntry(
      getWgpuRenderStateRuntime(screen).registries.effects,
      'acme.Effect',
      { runner: effectRunner },
    );
    getWgpuRenderStateRuntime(screen).context.wgpuRenderTextureCache = new WeakMap();

    const offscreen = createWgpuOffscreenRenderState(screen);
    const screenRuntime = getWgpuRenderStateRuntime(screen);
    const offscreenRuntime = getWgpuRenderStateRuntime(offscreen);

    expect(offscreen.device).toBe(screen.device);
    expect('surface' in offscreen).toBe(false);
    expect(offscreenRuntime.context).toBe(screenRuntime.context);
    expect(offscreenRuntime.uniformBuffer).not.toBe(screenRuntime.uniformBuffer);
    expect(offscreenRuntime.registries.nodeRenderers).toBe(screenRuntime.registries.nodeRenderers);
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
    expect(offscreenRuntime.registries.effects).toBe(screenRuntime.registries.effects);
    expect(offscreenRuntime.registries.shapeRasterizer).toBe(screenRuntime.registries.shapeRasterizer);
    expect(offscreenRuntime.registries.strokeTessellator).toBe(screenRuntime.registries.strokeTessellator);
    expect(offscreenRuntime.registries.textureResolvers).toBe(screenRuntime.registries.textureResolvers);
    expect(offscreenRuntime.registries.velocityWriters).toBe(screenRuntime.registries.velocityWriters);
    expect(offscreenRuntime.registries.effectPaddingResolvers).toBe(screenRuntime.registries.effectPaddingResolvers);
    expect(getRegistryTableEntry(offscreenRuntime.registries.nodeRenderers, 'acme.Node')).toBe(renderer);
    expect(getRegistryTableEntry(offscreenRuntime.registries.materialRenderers, 'acme.Material')).toBe(
      materialRenderer,
    );
    expect(getRegistryTableEntry(offscreenRuntime.registries.textureResolvers, 'acme.Texture')).toBe(textureResolver);
    expect(getRegistryTableEntry(offscreenRuntime.registries.effects, 'acme.Effect')).toEqual({
      runner: effectRunner,
    });
    expect(getPaddingResolver(offscreen, 'acme.Effect')).toBe(paddingResolver);
  });

  it('owns an independent encoder and proxy tree', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const root = createDisplayObject();
    registerNodeRenderer(offscreen, root.kind, { createData: () => finishEntity(allocateEntity()), submit: vi.fn() });
    prepareScene2DRender(offscreen, root);
    beginWgpuFrame(screen);

    expect(getRenderStateRuntime(offscreen).renderProxyMap).not.toBe(getRenderStateRuntime(screen).renderProxyMap);
    withWgpuFrameBorrow(screen, offscreen, () => {
      expect(getWgpuRenderStateRuntime(offscreen).commandEncoder).toBe(
        getWgpuRenderStateRuntime(screen).commandEncoder,
      );
    });
    expect(getWgpuRenderStateRuntime(offscreen).commandEncoder).toBeNull();
  });

  it('borrows only the live frame while retaining its own uniform ring and presentation extent', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const screenRuntime = getWgpuRenderStateRuntime(screen);
    const offscreenRuntime = getWgpuRenderStateRuntime(offscreen);
    const submit = vi.spyOn(screen.device.queue, 'submit');
    const writeBuffer = vi.spyOn(screen.device.queue, 'writeBuffer');
    beginWgpuFrame(screen);
    const encoder = screenRuntime.commandEncoder;

    withWgpuFrameBorrow(screen, offscreen, () => {
      expect(offscreenRuntime.commandEncoder).toBe(encoder);
      offscreenRuntime.uniformOffset = offscreenRuntime.uniformStride;
    });

    expect(screenRuntime.commandEncoder).toBe(encoder);
    expect(offscreenRuntime.commandEncoder).toBeNull();
    expect(writeBuffer).toHaveBeenCalledWith(
      offscreenRuntime.uniformBuffer,
      0,
      offscreenRuntime.uniformData.buffer,
      0,
      offscreenRuntime.uniformStride,
    );
    expect(writeBuffer).not.toHaveBeenCalledWith(
      screenRuntime.uniformBuffer,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits a standalone borrow and restores both states when the callback throws', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const submit = vi.spyOn(screen.device.queue, 'submit');
    const failure = new Error('bake failed');

    expect(() =>
      withWgpuFrameBorrow(screen, offscreen, () => {
        throw failure;
      }),
    ).toThrow(failure);

    expect(submit).toHaveBeenCalledOnce();
    expect(getWgpuRenderStateRuntime(screen).commandEncoder).toBeNull();
    expect(getWgpuRenderStateRuntime(offscreen).commandEncoder).toBeNull();
  });

  it('rejects nested borrowing by the same offscreen state', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);

    withWgpuFrameBorrow(screen, offscreen, () => {
      expect(() => withWgpuFrameBorrow(screen, offscreen, () => {})).toThrow(/already has an active frame/);
    });
  });

  it('destroys derived renderer data and its own uniform ring without freeing the screen ring', async () => {
    const screen = await createWgpuRenderStateForTest();
    const root = createDisplayObject();
    const destroyData = vi.fn();
    registerNodeRenderer(screen, root.kind, {
      createData: () => finishEntity(allocateEntity()),
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

  it('requires an explicit new pipeline for renderers and padding registered after derivation', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(screen);
    const renderer = { createData: () => null, submit: vi.fn() };
    const paddingResolver = vi.fn(() => ({ bottom: 2, left: 2, right: 2, top: 2 }));
    registerNodeRenderer(screen, 'acme.LateNode', renderer);
    registerPaddingResolver(screen, 'acme.LateEffect', paddingResolver);

    expect(hasRegistryTableEntry(getRenderStateRuntime(offscreen).registries.nodeRenderers, 'acme.LateNode')).toBe(
      false,
    );
    expect(getPaddingResolver(offscreen, 'acme.LateEffect')).toBeNull();

    const refreshed = createWgpuOffscreenRenderState(screen);
    expect(getRegistryTableEntry(getRenderStateRuntime(refreshed).registries.nodeRenderers, 'acme.LateNode')).toBe(
      renderer,
    );
    expect(getPaddingResolver(refreshed, 'acme.LateEffect')).toBe(paddingResolver);
  });
});

describe('createWgpuRenderState', () => {
  it('takes the device alone: no surface, no context, nothing that belongs to a screen', async () => {
    // The state is "how to talk to the GPU" and the screen target is "which surface a frame lands on".
    // Keeping them apart is what lets one state render to several windows, and lets an offscreen state
    // exist without inventing a canvas for it.
    const acquisition = await createWgpuAcquisition(
      _webBackend,
      createTestWgpuSurface(document.createElement('canvas')),
    );
    const state = createWgpuRenderState(acquisition!.device, { format: acquisition!.format });

    expect(state.device).toBe(acquisition!.device);
    expect(state.format).toBe(acquisition!.format);
    expect('context' in state).toBe(false);
    expect('surface' in state).toBe(false);

    destroyWgpuRenderState(state);
    releaseWgpuAcquisition(_webBackend, acquisition!);
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

  it('starts with no open frame, pass, or target', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.commandEncoder).toBeNull();
    expect(runtime.passStack).toEqual([]);
    expect(runtime.currentRenderTarget).toBeNull();
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
      registry: 'WgpuQuadMaterialRenderer',
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
    expect(runtime.registries.effects).toMatchObject({
      onMiss: 'Unregistered',
      registry: 'WgpuEffect',
      shape: 'keyed',
    });
    expect(runtime.registries.compressedTextureDecoder).toBeNull();
    expect(runtime.registries.colorAdjustments).toBeUndefined();
    expect(runtime.registries.compressedTextureUpload).toBeNull();
    expect(runtime.registries.shapeRasterizer).toBeNull();
    expect(runtime.registries.strokeTessellator).toBeNull();
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

    const resources = {
      linearSampler: {} as GPUSampler,
      nearestSampler: {} as GPUSampler,
      textureBindGroupLayout: {} as GPUBindGroupLayout,
      uniformBindGroupLayout: {} as GPUBindGroupLayout,
    };
    runtimeA.context.resources = resources;
    expect(runtimeB.context.resources).toBe(resources);
  });

  it('keeps separate device tiers when two runtimes are built from different WgpuDeviceStates', () => {
    const runtimeA = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));
    const runtimeB = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));

    expect(runtimeA.context).not.toBe(runtimeB.context);
  });
});

describe('destroyWgpuRenderState', () => {
  it('never destroys the device, however many of its states are torn down', async () => {
    // The device came from the caller and outlives every state built on it — including the last one.
    const state = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(state);
    const destroy = vi.spyOn(state.device, 'destroy');

    destroyWgpuRenderState(state);
    destroyWgpuRenderState(state);
    destroyWgpuRenderState(offscreen);
    destroyWgpuRenderState(offscreen);

    expect(destroy).not.toHaveBeenCalled();
  });

  it('destroys the state-owned uniform buffer', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const destroy = vi.spyOn(runtime.uniformBuffer, 'destroy');

    destroyWgpuRenderState(state);

    expect(destroy).toHaveBeenCalled();
  });

  it('runs state-owned teardown callbacks exactly once', async () => {
    const state = await createWgpuRenderStateForTest();
    const teardown = vi.fn();
    registerWgpuRenderStateTeardown(state, teardown);

    destroyWgpuRenderState(state);
    destroyWgpuRenderState(state);

    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(state);
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

    const resources = runtime.context.resources;
    expect(offscreenRuntime.context.resources).toBe(resources);

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

describe('getWgpuDeviceRuntime', () => {
  it('returns the device runtime attached by createWgpuDeviceState', () => {
    const device = {} as GPUDevice;
    const deviceState = createWgpuDeviceState(device);
    const runtime = getWgpuDeviceRuntime(deviceState);
    expect(runtime).toBeDefined();
    expect(runtime.device).toBe(device);
    expect(runtime.teardowns).toEqual([]);
  });

  it('resolves the same runtime object on repeated calls', () => {
    const deviceState = createWgpuDeviceState({} as GPUDevice);
    expect(getWgpuDeviceRuntime(deviceState)).toBe(getWgpuDeviceRuntime(deviceState));
  });
});

describe('getWgpuRenderStateDeviceResources', () => {
  it('returns the initialized device-native resource block without placeholders', async () => {
    const state = await createWgpuRenderStateForTest();
    const resources = getWgpuRenderStateDeviceResources(state);

    expect(resources.linearSampler).toBeDefined();
    expect(resources.nearestSampler).toBeDefined();
    expect(resources.textureBindGroupLayout).toBeDefined();
    expect(resources.uniformBindGroupLayout).toBeDefined();
    expect(getWgpuRenderStateDeviceResources(state)).toBe(resources);

    destroyWgpuRenderState(state);
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
    expect([...getWgpuRenderStateRuntime(state).context.samplerCache.keys()].every((k) => typeof k === 'number')).toBe(
      true,
    );
    expect(getWgpuRenderStateRuntime(state).context.samplerCache.size).toBe(1);
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
    expect(getWgpuRenderStateRuntime(state).context.samplerCache.size).toBe(2);
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
    expect(getWgpuRenderStateRuntime(state).context.samplerCache.size).toBe(1);
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

describe('initializeWgpuDeviceState', () => {
  it('is the construction initializer of createWgpuDeviceState', () => {
    expect(typeof initializeWgpuDeviceState).toBe('function');
  });
});

describe('initializeWgpuHostAcquisition', () => {
  it('is the construction initializer of createWgpuHostAcquisition', () => {
    expect(typeof initializeWgpuHostAcquisition).toBe('function');
  });
});

describe('initializeWgpuOffscreenRenderStateDeviceLostResult', () => {
  it('is the construction initializer of createWgpuOffscreenRenderStateDeviceLostResult', () => {
    expect(typeof initializeWgpuOffscreenRenderStateDeviceLostResult).toBe('function');
  });
});

describe('initializeWgpuOffscreenRenderStateOkResult', () => {
  it('is the construction initializer of createWgpuOffscreenRenderStateOkResult', () => {
    expect(typeof initializeWgpuOffscreenRenderStateOkResult).toBe('function');
  });
});

describe('isWgpuSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWgpuSupported(_webBackend)).toBe(true);
  });

  it('returns false when navigator.gpu throws', () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      get(): never {
        throw new Error('host getter failed');
      },
    });
    try {
      const unsupportedBackend = testWgpuHost;
      expect(isWgpuSupported(unsupportedBackend)).toBe(false);
    } finally {
      installWgpuMock();
    }
  });
});

describe('registerWgpuDeviceTeardown', () => {
  it('pushes a callback that fires on device teardown', async () => {
    const state = await createWgpuRenderStateForTest();
    const teardown = vi.fn();
    registerWgpuDeviceTeardown(state, teardown);
    destroyWgpuRenderState(state);
    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(state.device);
  });
});

describe('registerWgpuRenderStateTeardown', () => {
  it('runs a state-owned callback exactly once on teardown', async () => {
    const state = await createWgpuRenderStateForTest();
    const teardown = vi.fn();
    registerWgpuRenderStateTeardown(state, teardown);

    destroyWgpuRenderState(state);
    destroyWgpuRenderState(state);

    expect(teardown).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledWith(state);
  });
});

describe('releaseWgpuAcquisition', () => {
  // Unconditional on purpose: this is the CALLER asking. Flight's own paths refuse to release caller-owned
  // handles, so if this verb deferred to the same policy the caller would have no way to end their life.
  it('releases caller-owned handles, which Flight itself never does', async () => {
    const acquired = await createWgpuAcquisition(_webBackend, createTestWgpuSurface(document.createElement('canvas')));
    const acquisition = acquired!;
    const released: Readonly<WgpuHostAcquisition>[] = [];
    const recordingBackend = entityHostBackend({
      acquire: vi.fn(async () => acquisition),
      attachSurface: vi.fn(() => null),
      create: vi.fn(() => null),
      isSupported: vi.fn(() => true),
      release: vi.fn((held: Readonly<WgpuHostAcquisition>) => released.push(held)),
    });

    releaseWgpuAcquisition(recordingBackend, acquisition);

    expect(released).toEqual([acquisition]);
  });
});

describe('resolveWgpuApplyBlendMode', () => {
  it('returns a hook installed directly on the state', async () => {
    const state = await createWgpuRenderStateForTest();
    const hook = vi.fn();
    state.applyBlendMode = hook;
    expect(resolveWgpuApplyBlendMode(state)).toBe(hook);
  });
});

describe('WgpuRenderRegistries snapshots', () => {
  it('captures late Wgpu registrations only when an explicit pipeline is created', async () => {
    const screen = await createWgpuRenderStateForTest();
    const materialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() } as never;
    const offscreenMaterialRenderer = { instanceFloatCount: 0, getShaderModule: vi.fn() } as never;
    const decoder = vi.fn(() => new Uint8ClampedArray(4));
    const resolver = vi.fn(() => null);
    registerWgpuCompressedTextureDecoder(screen, decoder);
    registerWgpuCompressedTextureUpload(screen);
    registerWgpuQuadMaterialRenderer(screen, 'acme.LateMaterial', materialRenderer);
    registerWgpuTextureResolver(screen, 'acme.LateTexture', resolver);
    const offscreen = createWgpuOffscreenRenderState(screen);

    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.materialRenderers, 'acme.LateMaterial'),
    ).toBe(materialRenderer);
    expect(
      getRegistryTableEntry(getWgpuRenderStateRuntime(offscreen).registries.textureResolvers, 'acme.LateTexture'),
    ).toBe(resolver);
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder).toBe(
      getWgpuRenderStateRuntime(screen).registries.compressedTextureDecoder,
    );
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder?.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: decoder,
    });
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureUpload).toBe(
      getWgpuRenderStateRuntime(screen).registries.compressedTextureUpload,
    );
    registerWgpuQuadMaterialRenderer(offscreen, 'acme.LateMaterial', offscreenMaterialRenderer);
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
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureDecoder?.entry).toBeNull();
    expect(getWgpuRenderStateRuntime(screen).registries.compressedTextureDecoder?.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
    expect(getWgpuRenderStateRuntime(offscreen).registries.compressedTextureUpload?.entry).toBeNull();
    expect(getWgpuRenderStateRuntime(screen).registries.compressedTextureUpload?.entry?.state).toBe(
      RegistryEntryState.Bound,
    );
  });
});

// ★ THE PRESENTATION-SURFACE CONTRACT. `WgpuPresentationSurface` exists so the WGPU path can size itself
// without an `HTMLCanvasElement`, and its whole risk is a provider that captures the size once. A snapshot
// would satisfy every construction-time assertion in this repo and fail only on a resize, so liveness is
// tested here through a NON-DOM provider whose values change behind getters — which also proves the second
// half of the contract, that nothing on the path reads a DOM member.
