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
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { beginWgpuFrame } from './wgpuBackground';
import { registerWgpuCompressedTextureDecoder, registerWgpuCompressedTextureUpload } from './wgpuCompressedTexture';
import { registerWgpuMaterialRenderer } from './wgpuMaterialRegistry';
import {
  copyWgpuRenderStateRegistrations,
  createWgpuOffscreenRenderState,
  createWgpuRenderStateRuntime,
  destroyWgpuRenderState,
  getWgpuColorAdjustmentMaterialFeature,
  getWgpuColorAdjustmentMaterialFeatureGuard,
  getWgpuRenderStateRuntime,
  getWgpuSampler,
  isWgpuSupported,
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

describe('createWgpuOffscreenRenderState', () => {
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
    expect(offscreen.canvas).toBe(screen.canvas);
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

  it('stores the canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('starts with null renderPass and commandEncoder', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.commandEncoder).toBeNull();
  });
});

describe('createWgpuRenderStateRuntime', () => {
  it('returns a runtime with the base binding slot and empty named registration tables', () => {
    const runtime = createWgpuRenderStateRuntime();
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
});

describe('destroyWgpuRenderState', () => {
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
});
