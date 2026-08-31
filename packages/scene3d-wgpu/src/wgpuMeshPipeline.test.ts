import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry, createMeshGeometry } from '@flighthq/mesh/contract';
import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createTexture, setTextureUvOffset, setTextureUvScale } from '@flighthq/texture/contract';
import type {
  Camera3D,
  Bitmap,
  Image,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  Texture,
  WgpuColorAdjustmentMaterialFeature,
  WgpuMaterialBinding,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  BlendMode,
  ImageTextureSourceKind,
  SCENE_LIGHT_BLOCK_FLOATS,
} from '@flighthq/types/contract';

import {
  beginWgpuMeshDraw,
  buildWgpuMaterialBindGroup,
  buildWgpuPerMapMaterialBindGroup,
  createWgpuMeshPipeline,
  drawWgpuMeshSubset,
  ensureWgpuMaterialBinding,
  ensureWgpuPerMapMaterialBinding,
  ensureWgpuFrameBindGroup,
  ensureWgpuIblSampleBindGroup,
  ensureWgpuIblSampleLayout,
  ensureWgpuPbrSampleBindGroup,
  ensureWgpuPbrSampleLayout,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScene3DLayouts,
  ensureWgpuScene3DPipeline,
  ensureWgpuShadowSampleBindGroup,
  ensureWgpuShadowSampleLayout,
  getWgpuMaterialSampler,
  getWgpuMeshPreludeWgsl,
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
  spliceWgpuColorAdjustmentPrelude,
  stashWgpuUvTransform,
  isWgpuMaterialBindGroupRebuildNeeded,
  wgpuPerMapMaterialBindGroupNeedsRebuild,
  WGPU_MESH_PRELUDE_WGSL,
  writeWgpuDrawUniform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState, makeWgpuSkinningAdapter } from './wgpuScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): Scene3DLightBlock {
  const data = new Float32Array(SCENE_LIGHT_BLOCK_FLOATS);
  data[1] = -1;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

describe('beginWgpuMeshDraw', () => {
  it('stores the active pipeline, sets it, and binds the frame group', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    const pipeline = makePipeline(state);
    beginWgpuMeshDraw(state, pipeline);
    expect(getWgpuScene3DRuntime(state).activeMeshPipeline).toBe(pipeline);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 0)).toBe(true);
  });

  it('does not bind group(3) for a pipeline without a shadow layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(false);
  });

  it('binds the shared shadow group at group(3) for a shadow pipeline', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makeShadowPipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });

  it('binds the combined PBR sample group at group(3)', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePbrSamplePipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });
});

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createStandardPbrMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

function makePipeline(state: ReturnType<typeof makeWgpuScene3DState>['state']) {
  const module = state.device.createShaderModule({ code: '' });
  const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
  return createWgpuMeshPipeline(state, { doubleSided: false, format: 'bgra8unorm', materialBindGroupLayout, module });
}

function makeShadowPipeline(state: ReturnType<typeof makeWgpuScene3DState>['state']) {
  const module = state.device.createShaderModule({ code: '' });
  const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
  return createWgpuMeshPipeline(state, {
    doubleSided: false,
    format: 'bgra8unorm',
    materialBindGroupLayout,
    module,
    shadowBindGroupLayout: ensureWgpuShadowSampleLayout(state),
  });
}

function makePbrSamplePipeline(state: ReturnType<typeof makeWgpuScene3DState>['state']) {
  const module = state.device.createShaderModule({ code: '' });
  const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
  return createWgpuMeshPipeline(state, {
    doubleSided: false,
    format: 'bgra8unorm',
    materialBindGroupLayout,
    module,
    pbrSampleBindGroupLayout: ensureWgpuPbrSampleLayout(state),
  });
}

describe('buildWgpuMaterialBindGroup', () => {
  it('emits the uniform buffer at 0, the sampler at 1, and each map view at 2 + i', () => {
    const { fake, state } = makeWgpuScene3DState();
    const layout = {} as GPUBindGroupLayout;
    const buffer = {} as GPUBuffer;
    const sampler = {} as GPUSampler;
    const view0 = {} as GPUTextureView;
    const view1 = {} as GPUTextureView;

    buildWgpuMaterialBindGroup(state, layout, buffer, sampler, [view0, view1]);

    const call = fake.calls.find((c) => c.name === 'createBindGroup');
    const entries = (call!.args[0] as { entries: GPUBindGroupEntry[] }).entries;
    expect(entries.map((e) => e.binding)).toEqual([0, 1, 2, 3]);
    expect((entries[0].resource as { buffer: GPUBuffer }).buffer).toBe(buffer);
    expect(entries[1].resource).toBe(sampler);
    expect(entries[2].resource).toBe(view0);
    expect(entries[3].resource).toBe(view1);
  });
});

describe('buildWgpuPerMapMaterialBindGroup', () => {
  it('emits parallel samplers before their matching map views', () => {
    const { fake, state } = makeWgpuScene3DState();
    const layout = {} as GPUBindGroupLayout;
    const buffer = {} as GPUBuffer;
    const sampler0 = {} as GPUSampler;
    const sampler1 = {} as GPUSampler;
    const view0 = {} as GPUTextureView;
    const view1 = {} as GPUTextureView;

    buildWgpuPerMapMaterialBindGroup(state, layout, buffer, [sampler0, sampler1], [view0, view1]);

    const call = fake.calls.find((c) => c.name === 'createBindGroup');
    const entries = (call!.args[0] as { entries: GPUBindGroupEntry[] }).entries;
    expect(entries.map((entry) => entry.binding)).toEqual([0, 1, 2, 3, 4]);
    expect((entries[0].resource as { buffer: GPUBuffer }).buffer).toBe(buffer);
    expect(entries.slice(1).map((entry) => entry.resource)).toEqual([sampler0, sampler1, view0, view1]);
  });
});

describe('createWgpuMeshPipeline', () => {
  it('builds a pipeline over the shared frame + draw layouts', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = makePipeline(state);
    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(pipeline.hasShadowGroup).toBe(false);
    const layoutCall = fake.calls.find((c) => c.name === 'createPipelineLayout');
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(3);
  });

  it('appends the shadow layout as group(3) when given a shadow bind-group layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = makeShadowPipeline(state);
    expect(pipeline.hasShadowGroup).toBe(true);
    const layoutCall = fake.calls.filter((c) => c.name === 'createPipelineLayout').at(-1);
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(4);
  });

  it('uses one group(3) sample layout for PBR shadow and IBL resources', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = makePbrSamplePipeline(state);
    expect(pipeline.hasPbrSampleGroup).toBe(true);
    expect(pipeline.hasShadowGroup).toBe(false);
    expect(pipeline.hasIblGroup).toBe(false);
    const layoutCall = fake.calls.filter((c) => c.name === 'createPipelineLayout').at(-1);
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(4);
  });

  // Normal is a premultiplied blend state unconditionally: srcFactor 'one', not 'src-alpha'. A material
  // no longer declares an alpha convention, so there is nothing left to make this vary.
  it('uses premultiplied blending and disables depth writes for a blended variant', () => {
    const { fake, state } = makeWgpuScene3DState();
    const module = state.device.createShaderModule({ code: '' });
    const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
    createWgpuMeshPipeline(state, {
      blended: true,
      doubleSided: false,
      format: 'bgra8unorm',
      materialBindGroupLayout,
      module,
    });

    const call = fake.calls.filter((c) => c.name === 'createRenderPipeline').at(-1);
    const descriptor = call!.args[0] as GPURenderPipelineDescriptor;
    expect(Array.from(descriptor.fragment!.targets)[0]!.blend).toEqual({
      alpha: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'one' },
      color: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'one' },
    });
    expect(descriptor.depthStencil!.depthWriteEnabled).toBe(false);
  });

  it('uses the active surface blend mode for a blended variant', () => {
    const { fake, state } = makeWgpuScene3DState();
    getWgpuScene3DRuntime(state).activeBlendMode = BlendMode.Add;
    const module = state.device.createShaderModule({ code: '' });
    const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
    createWgpuMeshPipeline(state, {
      blended: true,
      doubleSided: false,
      format: 'bgra8unorm',
      materialBindGroupLayout,
      module,
    });

    const call = fake.calls.filter((c) => c.name === 'createRenderPipeline').at(-1);
    const descriptor = call!.args[0] as GPURenderPipelineDescriptor;
    expect(Array.from(descriptor.fragment!.targets)[0]!.blend).toEqual({
      alpha: { dstFactor: 'one', operation: 'add', srcFactor: 'one' },
      color: { dstFactor: 'one', operation: 'add', srcFactor: 'one' },
    });
  });

  it('keeps blending disabled and depth writes enabled for an opaque variant', () => {
    const { fake, state } = makeWgpuScene3DState();
    makePipeline(state);
    const call = fake.calls.filter((c) => c.name === 'createRenderPipeline').at(-1);
    const descriptor = call!.args[0] as GPURenderPipelineDescriptor;
    expect(Array.from(descriptor.fragment!.targets)[0]!.blend).toBeUndefined();
    expect(descriptor.depthStencil!.depthWriteEnabled).toBe(true);
  });
});

describe('drawWgpuMeshSubset', () => {
  it('issues an indexed draw over the subset after a pipeline is active', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePipeline(state));
    const proxy = makeProxy();
    drawWgpuMeshSubset(state, proxy, createBoxMeshGeometry());
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(proxy.subset.indexCount);
  });

  // The defect this covers: non-indexed geometry issued NO draw call at all, so a valid imported mesh
  // rendered nothing and reported nothing. A backend that silently drops geometry is worse than one
  // that draws it wrong, because nothing announces the loss.
  it('issues a non-indexed draw for geometry without indices', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePipeline(state));
    const geometry = createMeshGeometry({
      indices: null,
      layout: {
        attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
        stride: 12,
      },
      vertices: new Float32Array(9),
    });
    const proxy: Scene3DRenderProxy = {
      material: createStandardPbrMaterial(),
      normalMatrix: createMatrix3(),
      subset: geometry.subsets[0],
      worldMatrix: createMatrix4(),
    };

    drawWgpuMeshSubset(state, proxy, geometry);

    const draw = fake.calls.find((c) => c.name === 'draw');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(proxy.subset.indexCount);
    expect(draw!.args[2]).toBe(proxy.subset.indexOffset);
    // It must not try to bind an index buffer it does not have.
    expect(fake.calls.some((c) => c.name === 'setIndexBuffer')).toBe(false);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });

  it('is a no-op when no pipeline is active', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuMeshSubset(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('ensureWgpuFrameBindGroup', () => {
  it('creates the frame buffer + bind group once and reuses them', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuFrameBindGroup(state);
    const buffers = fake.calls.filter((c) => c.name === 'createBuffer').length;
    const b = ensureWgpuFrameBindGroup(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(buffers);
  });
});

describe('ensureWgpuIblSampleBindGroup', () => {
  it('writes the disabled IBL uniform and reuses the bind group when no IBL changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuIblSampleBindGroup(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuIblSampleBindGroup(state);
    expect(a).toBe(b);
    // No new bind group on the second call (dummy views unchanged); the uniform is rewritten each call.
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(made);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('rebuilds the bind group when a baked IBL set becomes present', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuIblSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    // Simulate bakeWgpuEnvironmentIbl having stored a baked set this frame.
    getWgpuScene3DRuntime(state).ibl = {
      brdfLut: {} as GPUTexture,
      brdfLutView: {} as GPUTextureView,
      intensity: 1,
      irradianceCube: {} as GPUTexture,
      irradianceCubeView: {} as GPUTextureView,
      prefilteredCube: {} as GPUTexture,
      prefilteredCubeView: {} as GPUTextureView,
      prefilteredMipCount: 5,
    };
    ensureWgpuIblSampleBindGroup(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(before + 1);
  });
});

describe('ensureWgpuIblSampleLayout', () => {
  it('creates the IBL-sample layout once per state', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuIblSampleLayout(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    const b = ensureWgpuIblSampleLayout(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
  });
});

describe('ensureWgpuMaterialBinding', () => {
  const layout = {} as GPUBindGroupLayout;
  const sampler = {} as GPUSampler;
  const view0 = {} as GPUTextureView;
  const view1 = {} as GPUTextureView;

  it('creates the buffer + bind group once, owns a copy of the scratch, and steady-state binds build nothing', () => {
    const { fake, state } = makeWgpuScene3DState();
    const key = {};
    const scratch = [view0, view1];
    const binding = ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);

    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(1);
    // The binding owns a COPY of the scratch — a later material's bind reusing the scratch must not
    // corrupt this binding's cached views.
    expect(binding.views).not.toBe(scratch);
    expect(binding.views).toEqual([view0, view1]);

    // Steady state: same key + same sampler + same view identities re-bound → no new GPU objects built
    // (the hot path allocates/builds nothing; the caller's uniform write is separate).
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);
    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(1);
  });

  it('rebuilds the bind group in place (reusing the buffer) when a resolved view changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    const key = {};
    const scratch = [view0, view1];
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);
    // A live map swap resolves to a new view identity in the reused scratch.
    scratch[0] = {} as GPUTextureView;
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);

    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(1); // buffer reused
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(2); // bind group rebuilt
  });

  it('rebuilds when the primary sampler changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    const key = {};
    const scratch = [view0, view1];
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);
    ensureWgpuMaterialBinding(state, key, layout, 48, {} as GPUSampler, scratch);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(2);
  });
});

describe('ensureWgpuPbrSampleBindGroup', () => {
  it('packs shadow and IBL sample bindings into one cached group', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuPbrSampleBindGroup(state);
    const bindGroupCall = fake.calls.filter((c) => c.name === 'createBindGroup').at(-1);
    const made = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuPbrSampleBindGroup(state);

    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(made);
    expect((bindGroupCall!.args[0] as { entries: unknown[] }).entries.length).toBe(8);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBeGreaterThanOrEqual(2);
  });

  it('rebuilds the group when a shadow map becomes present', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuPbrSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;

    getWgpuScene3DRuntime(state).shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      enabled: true,
      mapHeight: 1024,
      mapWidth: 1024,
      matrix: createMatrix4(),
      normalBiasWorld: 0,
      pcfRadius: 0,
      shadowBias: 0,
    };

    ensureWgpuPbrSampleBindGroup(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(before + 1);
  });

  it('packs the directional shadow configuration into the combined PBR uniform', () => {
    const { fake, state } = makeWgpuScene3DState();
    const runtime = getWgpuScene3DRuntime(state);
    runtime.shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      enabled: true,
      mapHeight: 1024,
      mapWidth: 1024,
      matrix: createMatrix4(),
      normalBiasWorld: 0.02,
      pcfRadius: 2,
      shadowBias: 0.01,
    };

    ensureWgpuPbrSampleBindGroup(state);

    const write = fake.calls.find(
      (call) => call.name === 'writeBuffer' && call.args[0] === runtime.shadowUniformBuffer,
    );
    const values = new Float32Array(write!.args[2] as ArrayBuffer);
    expect(Array.from(values.slice(16, 20))).toEqual([1, 2, expect.closeTo(0.01), expect.closeTo(0.02)]);
  });
});

describe('ensureWgpuPbrSampleLayout', () => {
  it('creates the combined PBR sample layout once per state', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuPbrSampleLayout(state);
    const layoutCall = fake.calls.filter((c) => c.name === 'createBindGroupLayout').at(-1);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    const b = ensureWgpuPbrSampleLayout(state);

    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
    expect((layoutCall!.args[0] as { entries: unknown[] }).entries.length).toBe(8);
  });
});

describe('ensureWgpuPerMapMaterialBinding', () => {
  const layout = {} as GPUBindGroupLayout;
  const sampler0 = {} as GPUSampler;
  const sampler1 = {} as GPUSampler;
  const view0 = {} as GPUTextureView;
  const view1 = {} as GPUTextureView;

  it('owns the parallel scratch copies and builds nothing on steady-state rebind', () => {
    const { fake, state } = makeWgpuScene3DState();
    const key = {};
    const samplers = [sampler0, sampler1];
    const views = [view0, view1];
    const binding = ensureWgpuPerMapMaterialBinding(state, key, layout, 48, samplers, views);

    expect(binding.samplers).not.toBe(samplers);
    expect(binding.views).not.toBe(views);
    expect(binding.samplers).toEqual(samplers);
    expect(binding.views).toEqual(views);
    ensureWgpuPerMapMaterialBinding(state, key, layout, 48, samplers, views);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(1);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(1);
  });

  it('rebuilds only the bind group when a non-primary sampler changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    const key = {};
    const samplers = [sampler0, sampler1];
    const views = [view0, view1];
    const binding = ensureWgpuPerMapMaterialBinding(state, key, layout, 48, samplers, views);
    const replacement = {} as GPUSampler;
    samplers[1] = replacement;

    const rebuilt = ensureWgpuPerMapMaterialBinding(state, key, layout, 48, samplers, views);

    expect(rebuilt).toBe(binding);
    expect(rebuilt.samplers).toEqual([sampler0, replacement]);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(1);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(2);
  });
});

describe('ensureWgpuPlaceholderTextureView', () => {
  it('creates the 1x1 white texture once and reuses the view', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuPlaceholderTextureView(state);
    const textures = fake.calls.filter((c) => c.name === 'createTexture').length;
    const b = ensureWgpuPlaceholderTextureView(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createTexture').length).toBe(textures);
  });
});

describe('ensureWgpuScene3DLayouts', () => {
  it('creates the frame + draw layouts once per state', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuScene3DLayouts(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    ensureWgpuScene3DLayouts(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
  });
});

describe('ensureWgpuScene3DPipeline', () => {
  it('compiles a key once and returns the cached pipeline', () => {
    const { state } = makeWgpuScene3DState();
    let compiles = 0;
    const compile = () => {
      compiles++;
      return makePipeline(state);
    };
    const a = ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    const b = ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    expect(a).toBe(b);
    expect(compiles).toBe(1);
  });

  it('caches separate opaque and blended variants of the same family key', () => {
    const { state } = makeWgpuScene3DState();
    const variants: boolean[] = [];
    const compile = (blended: boolean) => {
      variants.push(blended);
      return makePipeline(state);
    };

    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    getWgpuScene3DRuntime(state).activeBlendedRun = true;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);

    expect(variants).toEqual([false, true]);
    expect(Array.from(getWgpuScene3DRuntime(state).pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|opaque|rigid',
      'fam:bgra8unorm|-|blend:Normal|rigid',
    ]);
  });

  it('caches distinct blended equations as separate immutable pipeline variants', () => {
    const { state } = makeWgpuScene3DState();
    let compiles = 0;
    const compile = () => {
      compiles++;
      return makePipeline(state);
    };
    const runtime = getWgpuScene3DRuntime(state);
    runtime.activeBlendedRun = true;
    runtime.activeBlendMode = BlendMode.Add;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    runtime.activeBlendMode = BlendMode.Multiply;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);

    expect(compiles).toBe(2);
    expect(Array.from(runtime.pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|blend:Add|rigid',
      'fam:bgra8unorm|-|blend:Multiply|rigid',
    ]);
  });

  // The inverse of what this used to assert. Pipeline identity carried an alpha-convention segment while
  // a material could pick its blend factors; now one blend mode is one premultiplied state, so repeated
  // draws of the same mode share a single compiled pipeline rather than splitting into two variants.
  it('caches one pipeline variant per blend mode, not per alpha convention', () => {
    const { state } = makeWgpuScene3DState();
    let compiles = 0;
    const compile = () => {
      compiles++;
      return makePipeline(state);
    };
    const runtime = getWgpuScene3DRuntime(state);
    runtime.activeBlendedRun = true;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    runtime.activeBlendMode = BlendMode.Add;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);

    expect(compiles).toBe(2);
    expect(Array.from(runtime.pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|blend:Normal|rigid',
      'fam:bgra8unorm|-|blend:Add|rigid',
    ]);
  });

  it('caches rigid and skinned variants independently', () => {
    const { state } = makeWgpuScene3DState();
    const variants: boolean[] = [];
    const compile = (_blended: boolean, skinned: boolean) => {
      variants.push(skinned);
      return makePipeline(state);
    };

    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);
    getWgpuScene3DRuntime(state).activeSkinnedRun = true;
    ensureWgpuScene3DPipeline(state, 'fam:bgra8unorm|-', compile);

    expect(variants).toEqual([false, true]);
    expect(Array.from(getWgpuScene3DRuntime(state).pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|opaque|rigid',
      'fam:bgra8unorm|-|opaque|skin',
    ]);
  });
});

describe('ensureWgpuShadowSampleBindGroup', () => {
  it('writes the disabled shadow uniform and reuses the bind group when no shadow changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuShadowSampleBindGroup(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuShadowSampleBindGroup(state);
    expect(a).toBe(b);
    // No new bind group on the second call (dummy view unchanged); the uniform is rewritten each call.
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(made);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('rebuilds the bind group when a shadow map becomes present', () => {
    const { fake, state } = makeWgpuScene3DState();
    ensureWgpuShadowSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    // Simulate drawWgpuScene3DShadowMap having stored a shadow this frame.
    getWgpuScene3DRuntime(state).shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      enabled: true,
      mapHeight: 1024,
      mapWidth: 1024,
      matrix: createMatrix4(),
      normalBiasWorld: 0,
      pcfRadius: 0,
      shadowBias: 0,
    };
    ensureWgpuShadowSampleBindGroup(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(before + 1);
  });

  it('packs the same directional shadow configuration into the classic/toon uniform', () => {
    const { fake, state } = makeWgpuScene3DState();
    const runtime = getWgpuScene3DRuntime(state);
    runtime.shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      enabled: true,
      mapHeight: 1024,
      mapWidth: 1024,
      matrix: createMatrix4(),
      normalBiasWorld: 0.02,
      pcfRadius: 2,
      shadowBias: 0.01,
    };

    ensureWgpuShadowSampleBindGroup(state);

    const write = fake.calls.find(
      (call) => call.name === 'writeBuffer' && call.args[0] === runtime.shadowUniformBuffer,
    );
    const values = new Float32Array(write!.args[2] as ArrayBuffer);
    expect(Array.from(values.slice(16, 20))).toEqual([1, 2, expect.closeTo(0.01), expect.closeTo(0.02)]);
  });
});

describe('ensureWgpuShadowSampleLayout', () => {
  it('creates the shadow-sample layout once per state', () => {
    const { fake, state } = makeWgpuScene3DState();
    const a = ensureWgpuShadowSampleLayout(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    const b = ensureWgpuShadowSampleLayout(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
  });
});

describe('getWgpuMaterialSampler', () => {
  it('returns the shared clamp sampler for a null map', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuMaterialSampler(state, null)).toBe(getWgpuRenderStateDeviceResources(state).linearSampler);
  });

  it('derives a wrap- and mip-specific sampler for a tiling map', () => {
    const { state } = makeWgpuScene3DState();
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
    texture.sampler.wrapU = 'repeat';
    texture.sampler.wrapV = 'repeat';

    const sampler = getWgpuMaterialSampler(state, texture);

    // A non-clamp (tiling) map goes through the sampler cache, not the shared clamp sampler, and the
    // derivation is deterministic (same texture → same cached sampler).
    expect(sampler).not.toBe(getWgpuRenderStateDeviceResources(state).linearSampler);
    expect(getWgpuMaterialSampler(state, texture)).toBe(sampler);
  });

  it('preserves independent minification and magnification filters', () => {
    const { fake, state } = makeWgpuScene3DState();
    const texture = createTexture({ dimension: '2d', source: {} as Image });
    texture.sampler.minFilter = 'nearest';
    texture.sampler.magFilter = 'linear';

    getWgpuMaterialSampler(state, texture);

    expect(fake.calls.filter((c) => c.name === 'createSampler').at(-1)?.args[0]).toEqual(
      expect.objectContaining({ minFilter: 'nearest', magFilter: 'linear' }),
    );
  });

  it('drops the mip filter when the map disables mipmaps (distinct packed key from the mipmapped default)', () => {
    const { state } = makeWgpuScene3DState();
    const noMip = createTexture({ dimension: '2d', source: {} as Image });
    noMip.sampler.mipmaps = false;
    const withMip = createTexture({ dimension: '2d', source: {} as Image }); // default: trilinear (mipmaps on)

    getWgpuMaterialSampler(state, noMip);
    getWgpuMaterialSampler(state, withMip);
    // The two mip configs pack into two distinct numeric keys, so the cache holds both.
    expect(getWgpuRenderStateRuntime(state).context.samplerCache.size).toBe(2);
  });

  it('carries the map anisotropy into the derived sampler (distinct packed key from the non-anisotropic one)', () => {
    const { state } = makeWgpuScene3DState();
    const aniso = createTexture({ dimension: '2d', source: {} as Image });
    aniso.sampler.anisotropy = 8;
    const noAniso = createTexture({ dimension: '2d', source: {} as Image });

    getWgpuMaterialSampler(state, aniso);
    getWgpuMaterialSampler(state, noAniso);
    expect(getWgpuRenderStateRuntime(state).context.samplerCache.size).toBe(2);
  });
});

describe('getWgpuMeshPreludeWgsl', () => {
  it('adds the palette binding, attributes, and textureLoad skin matrix only to the skinned variant', () => {
    const rigid = getWgpuMeshPreludeWgsl(false);
    const skinned = getWgpuMeshPreludeWgsl(true, makeWgpuSkinningAdapter());

    expect(rigid).not.toContain('jointTexture');
    expect(rigid).not.toContain('joints0');
    expect(skinned).toContain('@group(1) @binding(1) var jointTexture');
    expect(skinned).toContain('@location(4) joints0 : vec4f');
    expect(skinned).toContain('@location(5) weights0 : vec4f');
    expect(skinned).toContain('textureLoad(jointTexture');
    expect(skinned).toContain('localPosition = skin * localPosition');
  });
});

describe('isWgpuMaterialBindGroupRebuildNeeded', () => {
  const sampler = {} as GPUSampler;
  const view0 = {} as GPUTextureView;
  const view1 = {} as GPUTextureView;
  const cached: WgpuMaterialBinding = {
    bindGroup: {} as GPUBindGroup,
    buffer: {} as GPUBuffer,
    sampler,
    views: [view0, view1],
  };

  it('is false when the sampler and every resolved view match the cache', () => {
    expect(isWgpuMaterialBindGroupRebuildNeeded(cached, sampler, [view0, view1])).toBe(false);
  });

  it('rebuilds when the primary sampler identity changes (a primary-map sampler edit)', () => {
    // Only the ONE primary-map sampler participates (shared-primary-sampler contract); a non-primary
    // map's per-Texture sampler is never bound and cannot trip this.
    expect(isWgpuMaterialBindGroupRebuildNeeded(cached, {} as GPUSampler, [view0, view1])).toBe(true);
  });

  it('rebuilds when any resolved view identity changes (swap / unready->ready / ready->ready / version++)', () => {
    // resolveWgpuMaterialTextureView is the invalidation seam: a texture swap, an unready->ready
    // transition, a ready->ready image replacement, or an Image version bump each yield a new
    // view identity, so this single identity check covers all four.
    expect(isWgpuMaterialBindGroupRebuildNeeded(cached, sampler, [{} as GPUTextureView, view1])).toBe(true);
  });

  it('rebuilds when the resolved view count changes or the cache has no views yet', () => {
    expect(isWgpuMaterialBindGroupRebuildNeeded(cached, sampler, [view0])).toBe(true);
    const noViews: WgpuMaterialBinding = { bindGroup: {} as GPUBindGroup, buffer: {} as GPUBuffer };
    expect(isWgpuMaterialBindGroupRebuildNeeded(noViews, sampler, [view0])).toBe(true);
  });
});

describe('isWgpuTextureReady', () => {
  it('is true when the texture declares a backing, even before that backing resolves', () => {
    expect(isWgpuTextureReady(null)).toBe(false);
    expect(isWgpuTextureReady({ dimension: '2d', source: null } as unknown as Texture)).toBe(false);
    expect(
      isWgpuTextureReady({
        dimension: '2d',
        source: { height: 1, kind: ImageTextureSourceKind, source: {}, version: 0, width: 1 } as Image,
      } as unknown as Texture),
    ).toBe(true);
    expect(
      isWgpuTextureReady({
        dimension: '2d',
        source: {
          data: new Uint8ClampedArray(4),
          height: 1,
          kind: BitmapTextureSourceKind,
          version: 0,
          width: 1,
        } as Bitmap,
      } as unknown as Texture),
    ).toBe(true);
  });
});

describe('resolveWgpuMaterialTextureView', () => {
  it('returns the shared placeholder view for a map without an image source', () => {
    const { state } = makeWgpuScene3DState();
    const placeholder = ensureWgpuPlaceholderTextureView(state);
    expect(resolveWgpuMaterialTextureView(state, null)).toBe(placeholder);
    expect(resolveWgpuMaterialTextureView(state, { dimension: '2d', source: null } as unknown as Texture)).toBe(
      placeholder,
    );
  });
});

describe('spliceWgpuColorAdjustmentPrelude', () => {
  it('widens Draw and injects only the registered backend chunk', () => {
    const feature: WgpuColorAdjustmentMaterialFeature = {
      fragmentShaderChunk: 'fn applyFlightColorAdjustment() {}',
      matrixFragmentShaderChunk: 'fn applyFlightColorMatrix() {}',
      record: () => {},
      resolveFlush: () => null,
    };
    const source = spliceWgpuColorAdjustmentPrelude(WGPU_MESH_PRELUDE_WGSL, feature);
    expect(source).toContain(feature.fragmentShaderChunk);
    expect(source).toContain('flightColorScale : vec4f');
    expect(source).toContain('flightColorBias : vec4f');
  });

  it('widens Draw to five vec4 fields for the matrix variant', () => {
    const feature: WgpuColorAdjustmentMaterialFeature = {
      fragmentShaderChunk: 'fn applyFlightColorAdjustment() {}',
      matrixFragmentShaderChunk: 'fn applyFlightColorMatrix() {}',
      record: () => {},
      resolveFlush: () => null,
    };
    const source = spliceWgpuColorAdjustmentPrelude(WGPU_MESH_PRELUDE_WGSL, feature, true);
    expect(source).toContain(feature.matrixFragmentShaderChunk);
    expect(source).toContain('flightColorMatrix0 : vec4f');
    expect(source).toContain('flightColorMatrixOffset : vec4f');
    expect(source).not.toContain('flightColorScale : vec4f');
  });
});

describe('stashWgpuUvTransform', () => {
  it('stores the column-major transform for a bound non-identity texture', () => {
    const { state } = makeWgpuScene3DState();
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
    setTextureUvScale(texture, 2, 3);
    setTextureUvOffset(texture, 0.5, 0.25);

    stashWgpuUvTransform(state, texture);

    // Column-major: col0 = scaled U axis, col1 = scaled V axis, col2 = translation.
    const stash = Array.from(getWgpuScene3DRuntime(state).pendingUvTransform).map((n) => n + 0);
    expect(stash).toEqual([2, 0, 0, 0, 3, 0, 0.5, 0.25, 1]);
  });

  it('resets to identity for a null texture', () => {
    const { state } = makeWgpuScene3DState();
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
    setTextureUvScale(texture, 4, 4);
    stashWgpuUvTransform(state, texture);

    stashWgpuUvTransform(state, null);

    expect(Array.from(getWgpuScene3DRuntime(state).pendingUvTransform)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('resets to identity for an identity-transform texture', () => {
    const { state } = makeWgpuScene3DState();

    stashWgpuUvTransform(
      state,
      createTexture({
        dimension: '2d',
        source: { kind: ImageTextureSourceKind } as Image,
      }),
    );

    expect(Array.from(getWgpuScene3DRuntime(state).pendingUvTransform)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('WGPU_MESH_PRELUDE_WGSL', () => {
  it('declares the shared Frame + Draw structs and the vertex entry', () => {
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Frame');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Draw');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('fn vs_main');
    expect(WGPU_MESH_PRELUDE_WGSL).not.toContain('srgbToLinear');
  });

  it('applies the uv transform in the shared vertex scene2d', () => {
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('uvTransform : mat3x3f');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('draw.uvTransform * vec3f(uv, 1.0)');
  });
});

describe('wgpuPerMapMaterialBindGroupNeedsRebuild', () => {
  const sampler0 = {} as GPUSampler;
  const sampler1 = {} as GPUSampler;
  const view0 = {} as GPUTextureView;
  const view1 = {} as GPUTextureView;
  const cached: WgpuMaterialBinding = {
    bindGroup: {} as GPUBindGroup,
    buffer: {} as GPUBuffer,
    samplers: [sampler0, sampler1],
    views: [view0, view1],
  };

  it('keeps an unchanged parallel sampler/view cache', () => {
    expect(wgpuPerMapMaterialBindGroupNeedsRebuild(cached, [sampler0, sampler1], [view0, view1])).toBe(false);
  });

  it('rebuilds when a non-primary sampler changes', () => {
    expect(wgpuPerMapMaterialBindGroupNeedsRebuild(cached, [sampler0, {} as GPUSampler], [view0, view1])).toBe(true);
  });

  it('rebuilds for a view change or mismatched array shape', () => {
    expect(wgpuPerMapMaterialBindGroupNeedsRebuild(cached, [sampler0, sampler1], [view0, {} as GPUTextureView])).toBe(
      true,
    );
    expect(wgpuPerMapMaterialBindGroupNeedsRebuild(cached, [sampler0], [view0, view1])).toBe(true);
  });
});

describe('writeWgpuDrawUniform', () => {
  it('writes the draw uniform and returns the dynamic-offset bind group', () => {
    const { state } = makeWgpuScene3DState();
    const group = writeWgpuDrawUniform(state, makeProxy());
    expect(group).toBeDefined();
    expect(getWgpuScene3DRuntime(state).pendingDrawOffset).toBe(0);
  });

  it('folds the stashed uv transform into the draw uniform', () => {
    const { state } = makeWgpuScene3DState();
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
    setTextureUvScale(texture, 2, 3);
    stashWgpuUvTransform(state, texture);

    writeWgpuDrawUniform(state, makeProxy());

    // The uvTransform occupies floats 28..39 (3 padded vec4) after world (0..15) + normalMatrix (16..27).
    const u = getWgpuRenderStateRuntime(state).uniformData;
    expect([u[28], u[29], u[30]].map((n) => n + 0)).toEqual([2, 0, 0]);
    expect([u[32], u[33], u[34]].map((n) => n + 0)).toEqual([0, 3, 0]);
  });

  it('persists the stash across draws so a material shared by many meshes tiles every one', () => {
    // Regression: drawWgpuScene3D binds once per material then draws many meshes. The stash must survive
    // each writeWgpuDrawUniform (not be consumed), or only the first mesh under a bind would tile.
    const { state } = makeWgpuScene3DState();
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
    setTextureUvScale(texture, 2, 3);
    stashWgpuUvTransform(state, texture);

    writeWgpuDrawUniform(state, makeProxy());
    // Not consumed — the stash still holds the transform for the next mesh under the same bind.
    expect(Array.from(getWgpuScene3DRuntime(state).pendingUvTransform).map((n) => n + 0)).toEqual([
      2, 0, 0, 0, 3, 0, 0, 0, 1,
    ]);

    // The second draw (no re-stash) folds the same transform into its own ring slot.
    const secondBase = getWgpuRenderStateRuntime(state).uniformOffset / 4;
    writeWgpuDrawUniform(state, makeProxy());
    const u = getWgpuRenderStateRuntime(state).uniformData;
    // col0.x = scaleX at +28, col1.y = scaleY at +33.
    expect([u[secondBase + 28], u[secondBase + 33]].map((n) => n + 0)).toEqual([2, 3]);
  });

  it('writes the resolved object alpha into the draw params', () => {
    const { state } = makeWgpuScene3DState();
    const proxy = makeProxy();
    proxy.alpha = 0.375;
    writeWgpuDrawUniform(state, proxy);
    expect(getWgpuRenderStateRuntime(state).uniformData[40]).toBeCloseTo(0.375);
  });

  it('packs a full color matrix into the existing 256-byte draw slot', () => {
    const { state } = makeWgpuScene3DState();
    const proxy = makeProxy();
    proxy.colorMatrix = [1, 0.5, 0, 0, 0.1, 0, 1, 0, 0, 0.2, 0, 0, 1, 0, 0.3, 0, 0, 0, 1, 0.4];
    writeWgpuDrawUniform(state, proxy);
    const u = getWgpuRenderStateRuntime(state).uniformData;
    expect(Array.from(u.slice(44, 48))).toEqual([1, 0.5, 0, 0]);
    expect(u[60]).toBeCloseTo(0.1);
    expect(u[63]).toBeCloseTo(0.4);
  });
});

describe('writeWgpuFrameUniform', () => {
  it('writes the frame uniform buffer', () => {
    const { fake, state } = makeWgpuScene3DState();
    writeWgpuFrameUniform(state, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('uses distinct cached buffers for distinct light blocks so queued draws retain their data', () => {
    const { state } = makeWgpuScene3DState();
    const camera = makeCamera();
    const firstLights = makeLights();
    const secondLights = makeLights();
    writeWgpuFrameUniform(state, camera, firstLights);
    const firstBuffer = getWgpuScene3DRuntime(state).frameBuffer;
    writeWgpuFrameUniform(state, camera, secondLights);
    const secondBuffer = getWgpuScene3DRuntime(state).frameBuffer;
    expect(secondBuffer).not.toBe(firstBuffer);
    writeWgpuFrameUniform(state, camera, firstLights);
    expect(getWgpuScene3DRuntime(state).frameBuffer).toBe(firstBuffer);
  });

  it('remaps OpenGL clip-space Z into WebGPU NDC depth', () => {
    const { fake, state } = makeWgpuScene3DState();
    const camera = createCamera3D({
      far: 11,
      near: 1,
      projection: { halfHeight: 1, halfWidth: 1, kind: 'orthographic' },
    });
    writeWgpuFrameUniform(state, camera, makeLights());

    const write = fake.calls.find((c) => c.name === 'writeBuffer');
    const frame = new Float32Array(write!.args[2] as ArrayBuffer, 0, 16);
    // With identity view, z=-near maps to NDC 0 and z=-far maps to NDC 1.
    const nearClipZ = frame[10] * -camera.near + frame[14];
    const nearClipW = frame[11] * -camera.near + frame[15];
    const farClipZ = frame[10] * -camera.far + frame[14];
    const farClipW = frame[11] * -camera.far + frame[15];
    expect(nearClipZ / nearClipW).toBeCloseTo(0);
    expect(farClipZ / farClipW).toBeCloseTo(1);
  });
});
