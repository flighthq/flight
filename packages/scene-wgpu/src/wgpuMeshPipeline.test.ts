import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createTexture, setTextureUvOffset, setTextureUvScale } from '@flighthq/texture';
import type {
  Camera3D,
  ImageResource,
  SceneLightBlock,
  SceneRenderProxy,
  Texture,
  WgpuMaterialBinding,
} from '@flighthq/types';
import { SCENE_LIGHT_BLOCK_FLOATS } from '@flighthq/types';

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
  ensureWgpuSceneLayouts,
  ensureWgpuScenePipeline,
  ensureWgpuShadowSampleBindGroup,
  ensureWgpuShadowSampleLayout,
  getWgpuMaterialSampler,
  getWgpuMeshPreludeWgsl,
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
  isWgpuMaterialBindGroupRebuildNeeded,
  wgpuPerMapMaterialBindGroupNeedsRebuild,
  WGPU_MESH_PRELUDE_WGSL,
  writeWgpuDrawUniform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState, makeWgpuSkinningAdapter } from './wgpuSceneTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(SCENE_LIGHT_BLOCK_FLOATS);
  data[1] = -1;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createStandardPbrMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

function makePipeline(state: ReturnType<typeof makeWgpuSceneState>['state']) {
  const module = state.device.createShaderModule({ code: '' });
  const materialBindGroupLayout = state.device.createBindGroupLayout({ entries: [] });
  return createWgpuMeshPipeline(state, { doubleSided: false, format: 'bgra8unorm', materialBindGroupLayout, module });
}

function makeShadowPipeline(state: ReturnType<typeof makeWgpuSceneState>['state']) {
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

function makePbrSamplePipeline(state: ReturnType<typeof makeWgpuSceneState>['state']) {
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

describe('beginWgpuMeshDraw', () => {
  it('stores the active pipeline, sets it, and binds the frame group', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuFrameBindGroup(state);
    const pipeline = makePipeline(state);
    beginWgpuMeshDraw(state, pipeline);
    expect(getWgpuSceneRuntime(state).activeMeshPipeline).toBe(pipeline);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 0)).toBe(true);
  });

  it('does not bind group(3) for a pipeline without a shadow layout', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(false);
  });

  it('binds the shared shadow group at group(3) for a shadow pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makeShadowPipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });

  it('binds the combined PBR sample group at group(3)', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePbrSamplePipeline(state));
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });
});

describe('buildWgpuMaterialBindGroup', () => {
  it('emits the uniform buffer at 0, the sampler at 1, and each map view at 2 + i', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    const pipeline = makePipeline(state);
    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(pipeline.hasShadowGroup).toBe(false);
    const layoutCall = fake.calls.find((c) => c.name === 'createPipelineLayout');
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(3);
  });

  it('appends the shadow layout as group(3) when given a shadow bind-group layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = makeShadowPipeline(state);
    expect(pipeline.hasShadowGroup).toBe(true);
    const layoutCall = fake.calls.filter((c) => c.name === 'createPipelineLayout').at(-1);
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(4);
  });

  it('uses one group(3) sample layout for PBR shadow and IBL resources', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = makePbrSamplePipeline(state);
    expect(pipeline.hasPbrSampleGroup).toBe(true);
    expect(pipeline.hasShadowGroup).toBe(false);
    expect(pipeline.hasIblGroup).toBe(false);
    const layoutCall = fake.calls.filter((c) => c.name === 'createPipelineLayout').at(-1);
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(4);
  });

  it('uses src-alpha blending and disables depth writes for a blended variant', () => {
    const { fake, state } = makeWgpuSceneState();
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
      color: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'src-alpha' },
    });
    expect(descriptor.depthStencil!.depthWriteEnabled).toBe(false);
  });

  it('keeps blending disabled and depth writes enabled for an opaque variant', () => {
    const { fake, state } = makeWgpuSceneState();
    makePipeline(state);
    const call = fake.calls.filter((c) => c.name === 'createRenderPipeline').at(-1);
    const descriptor = call!.args[0] as GPURenderPipelineDescriptor;
    expect(Array.from(descriptor.fragment!.targets)[0]!.blend).toBeUndefined();
    expect(descriptor.depthStencil!.depthWriteEnabled).toBe(true);
  });
});

describe('drawWgpuMeshSubset', () => {
  it('issues an indexed draw over the subset after a pipeline is active', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuFrameBindGroup(state);
    beginWgpuMeshDraw(state, makePipeline(state));
    const proxy = makeProxy();
    drawWgpuMeshSubset(state, proxy, createBoxMeshGeometry());
    const draw = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(proxy.subset.indexCount);
  });

  it('is a no-op when no pipeline is active', () => {
    const { fake, state } = makeWgpuSceneState();
    drawWgpuMeshSubset(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('ensureWgpuFrameBindGroup', () => {
  it('creates the frame buffer + bind group once and reuses them', () => {
    const { fake, state } = makeWgpuSceneState();
    const a = ensureWgpuFrameBindGroup(state);
    const buffers = fake.calls.filter((c) => c.name === 'createBuffer').length;
    const b = ensureWgpuFrameBindGroup(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(buffers);
  });
});

describe('ensureWgpuIblSampleBindGroup', () => {
  it('writes the disabled IBL uniform and reuses the bind group when no IBL changes', () => {
    const { fake, state } = makeWgpuSceneState();
    const a = ensureWgpuIblSampleBindGroup(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuIblSampleBindGroup(state);
    expect(a).toBe(b);
    // No new bind group on the second call (dummy views unchanged); the uniform is rewritten each call.
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(made);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('rebuilds the bind group when a baked IBL set becomes present', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuIblSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    // Simulate bakeWgpuEnvironmentIbl having stored a baked set this frame.
    getWgpuSceneRuntime(state).ibl = {
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    const key = {};
    const scratch = [view0, view1];
    ensureWgpuMaterialBinding(state, key, layout, 48, sampler, scratch);
    ensureWgpuMaterialBinding(state, key, layout, 48, {} as GPUSampler, scratch);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(2);
  });
});

describe('ensureWgpuPbrSampleBindGroup', () => {
  it('packs shadow and IBL sample bindings into one cached group', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuPbrSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;

    getWgpuSceneRuntime(state).shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      matrix: createMatrix4(),
    };

    ensureWgpuPbrSampleBindGroup(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(before + 1);
  });
});

describe('ensureWgpuPbrSampleLayout', () => {
  it('creates the combined PBR sample layout once per state', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    const a = ensureWgpuPlaceholderTextureView(state);
    const textures = fake.calls.filter((c) => c.name === 'createTexture').length;
    const b = ensureWgpuPlaceholderTextureView(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createTexture').length).toBe(textures);
  });
});

describe('ensureWgpuSceneLayouts', () => {
  it('creates the frame + draw layouts once per state', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuSceneLayouts(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    ensureWgpuSceneLayouts(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
  });
});

describe('ensureWgpuScenePipeline', () => {
  it('compiles a key once and returns the cached pipeline', () => {
    const { state } = makeWgpuSceneState();
    let compiles = 0;
    const compile = () => {
      compiles++;
      return makePipeline(state);
    };
    const a = ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);
    const b = ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);
    expect(a).toBe(b);
    expect(compiles).toBe(1);
  });

  it('caches separate opaque and blended variants of the same family key', () => {
    const { state } = makeWgpuSceneState();
    const variants: boolean[] = [];
    const compile = (blended: boolean) => {
      variants.push(blended);
      return makePipeline(state);
    };

    ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);
    getWgpuSceneRuntime(state).activeBlendedRun = true;
    ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);
    ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);

    expect(variants).toEqual([false, true]);
    expect(Array.from(getWgpuSceneRuntime(state).pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|opaque|rigid',
      'fam:bgra8unorm|-|blend|rigid',
    ]);
  });

  it('caches rigid and skinned variants independently', () => {
    const { state } = makeWgpuSceneState();
    const variants: boolean[] = [];
    const compile = (_blended: boolean, skinned: boolean) => {
      variants.push(skinned);
      return makePipeline(state);
    };

    ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);
    getWgpuSceneRuntime(state).activeSkinnedRun = true;
    ensureWgpuScenePipeline(state, 'fam:bgra8unorm|-', compile);

    expect(variants).toEqual([false, true]);
    expect(Array.from(getWgpuSceneRuntime(state).pipelineCache.keys())).toEqual([
      'fam:bgra8unorm|-|opaque|rigid',
      'fam:bgra8unorm|-|opaque|skin',
    ]);
  });
});

describe('ensureWgpuShadowSampleBindGroup', () => {
  it('writes the disabled shadow uniform and reuses the bind group when no shadow changes', () => {
    const { fake, state } = makeWgpuSceneState();
    const a = ensureWgpuShadowSampleBindGroup(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuShadowSampleBindGroup(state);
    expect(a).toBe(b);
    // No new bind group on the second call (dummy view unchanged); the uniform is rewritten each call.
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(made);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('rebuilds the bind group when a shadow map becomes present', () => {
    const { fake, state } = makeWgpuSceneState();
    ensureWgpuShadowSampleBindGroup(state);
    const before = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    // Simulate drawWgpuSceneShadowMap having stored a shadow this frame.
    getWgpuSceneRuntime(state).shadow = {
      depthTexture: {} as GPUTexture,
      depthView: {} as GPUTextureView,
      matrix: createMatrix4(),
    };
    ensureWgpuShadowSampleBindGroup(state);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(before + 1);
  });
});

describe('ensureWgpuShadowSampleLayout', () => {
  it('creates the shadow-sample layout once per state', () => {
    const { fake, state } = makeWgpuSceneState();
    const a = ensureWgpuShadowSampleLayout(state);
    const made = fake.calls.filter((c) => c.name === 'createBindGroupLayout').length;
    const b = ensureWgpuShadowSampleLayout(state);
    expect(a).toBe(b);
    expect(fake.calls.filter((c) => c.name === 'createBindGroupLayout').length).toBe(made);
  });
});

describe('getWgpuMaterialSampler', () => {
  it('returns the shared clamp sampler for a null map', () => {
    const { state } = makeWgpuSceneState();
    expect(getWgpuMaterialSampler(state, null)).toBe(getWgpuRenderStateRuntime(state).linearSampler);
  });

  it('derives a wrap- and mip-specific sampler for a tiling map', () => {
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    texture.sampler.wrapU = 'repeat';
    texture.sampler.wrapV = 'repeat';

    const sampler = getWgpuMaterialSampler(state, texture);

    // A non-clamp (tiling) map goes through the sampler cache, not the shared clamp sampler, and the
    // derivation is deterministic (same texture → same cached sampler).
    expect(sampler).not.toBe(getWgpuRenderStateRuntime(state).linearSampler);
    expect(getWgpuMaterialSampler(state, texture)).toBe(sampler);
  });

  it('drops the mip filter when the map disables mipmaps (distinct packed key from the mipmapped default)', () => {
    const { state } = makeWgpuSceneState();
    const noMip = createTexture({ image: {} as ImageResource });
    noMip.sampler.mipmaps = false;
    const withMip = createTexture({ image: {} as ImageResource }); // default: trilinear (mipmaps on)

    getWgpuMaterialSampler(state, noMip);
    getWgpuMaterialSampler(state, withMip);
    // The two mip configs pack into two distinct numeric keys, so the cache holds both.
    expect(getWgpuRenderStateRuntime(state).samplerCache.size).toBe(2);
  });

  it('carries the map anisotropy into the derived sampler (distinct packed key from the non-anisotropic one)', () => {
    const { state } = makeWgpuSceneState();
    const aniso = createTexture({ image: {} as ImageResource });
    aniso.sampler.anisotropy = 8;
    const noAniso = createTexture({ image: {} as ImageResource });

    getWgpuMaterialSampler(state, aniso);
    getWgpuMaterialSampler(state, noAniso);
    expect(getWgpuRenderStateRuntime(state).samplerCache.size).toBe(2);
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
    // transition, a ready->ready image replacement, or an ImageResource version bump each yield a new
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
  it('is true when the texture carries pixels (element or data), false otherwise', () => {
    expect(isWgpuTextureReady(null)).toBe(false);
    expect(isWgpuTextureReady({ image: null } as unknown as Texture)).toBe(false);
    expect(isWgpuTextureReady({ image: { source: null, data: null, compressed: null } } as unknown as Texture)).toBe(
      false,
    );
    expect(isWgpuTextureReady({ image: { source: {} } } as unknown as Texture)).toBe(true);
    expect(isWgpuTextureReady({ image: { source: null, data: new Uint8ClampedArray(4) } } as unknown as Texture)).toBe(
      true,
    );
  });
});

describe('resolveWgpuMaterialTextureView', () => {
  it('returns the shared placeholder view for a map without an image source', () => {
    const { state } = makeWgpuSceneState();
    const placeholder = ensureWgpuPlaceholderTextureView(state);
    expect(resolveWgpuMaterialTextureView(state, null)).toBe(placeholder);
    expect(resolveWgpuMaterialTextureView(state, { image: null } as unknown as Texture)).toBe(placeholder);
  });
});

describe('stashWgpuUvTransform', () => {
  it('stores the column-major transform for a bound non-identity texture', () => {
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 2, 3);
    setTextureUvOffset(texture, 0.5, 0.25);

    stashWgpuUvTransform(state, texture);

    // Column-major: col0 = scaled U axis, col1 = scaled V axis, col2 = translation.
    const stash = Array.from(getWgpuSceneRuntime(state).pendingUvTransform).map((n) => n + 0);
    expect(stash).toEqual([2, 0, 0, 0, 3, 0, 0.5, 0.25, 1]);
  });

  it('resets to identity for a null texture', () => {
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 4, 4);
    stashWgpuUvTransform(state, texture);

    stashWgpuUvTransform(state, null);

    expect(Array.from(getWgpuSceneRuntime(state).pendingUvTransform)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('resets to identity for an identity-transform texture', () => {
    const { state } = makeWgpuSceneState();

    stashWgpuUvTransform(state, createTexture({ image: {} as ImageResource }));

    expect(Array.from(getWgpuSceneRuntime(state).pendingUvTransform)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('WGPU_MESH_PRELUDE_WGSL', () => {
  it('declares the shared Frame + Draw structs and the vertex entry', () => {
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Frame');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Draw');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('fn vs_main');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('srgbToLinear');
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
    const { state } = makeWgpuSceneState();
    const group = writeWgpuDrawUniform(state, makeProxy());
    expect(group).toBeDefined();
    expect(getWgpuSceneRuntime(state).pendingDrawOffset).toBe(0);
  });

  it('folds the stashed uv transform into the draw uniform', () => {
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 2, 3);
    stashWgpuUvTransform(state, texture);

    writeWgpuDrawUniform(state, makeProxy());

    // The uvTransform occupies floats 28..39 (3 padded vec4) after world (0..15) + normalMatrix (16..27).
    const u = getWgpuRenderStateRuntime(state).uniformData;
    expect([u[28], u[29], u[30]].map((n) => n + 0)).toEqual([2, 0, 0]);
    expect([u[32], u[33], u[34]].map((n) => n + 0)).toEqual([0, 3, 0]);
  });

  it('persists the stash across draws so a material shared by many meshes tiles every one', () => {
    // Regression: drawWgpuScene binds once per material then draws many meshes. The stash must survive
    // each writeWgpuDrawUniform (not be consumed), or only the first mesh under a bind would tile.
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 2, 3);
    stashWgpuUvTransform(state, texture);

    writeWgpuDrawUniform(state, makeProxy());
    // Not consumed — the stash still holds the transform for the next mesh under the same bind.
    expect(Array.from(getWgpuSceneRuntime(state).pendingUvTransform).map((n) => n + 0)).toEqual([
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
    const { state } = makeWgpuSceneState();
    const proxy = makeProxy();
    proxy.alpha = 0.375;
    writeWgpuDrawUniform(state, proxy);
    expect(getWgpuRenderStateRuntime(state).uniformData[40]).toBeCloseTo(0.375);
  });
});

describe('writeWgpuFrameUniform', () => {
  it('writes the frame uniform buffer', () => {
    const { fake, state } = makeWgpuSceneState();
    writeWgpuFrameUniform(state, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('uses distinct cached buffers for distinct light blocks so queued draws retain their data', () => {
    const { state } = makeWgpuSceneState();
    const camera = makeCamera();
    const firstLights = makeLights();
    const secondLights = makeLights();
    writeWgpuFrameUniform(state, camera, firstLights);
    const firstBuffer = getWgpuSceneRuntime(state).frameBuffer;
    writeWgpuFrameUniform(state, camera, secondLights);
    const secondBuffer = getWgpuSceneRuntime(state).frameBuffer;
    expect(secondBuffer).not.toBe(firstBuffer);
    writeWgpuFrameUniform(state, camera, firstLights);
    expect(getWgpuSceneRuntime(state).frameBuffer).toBe(firstBuffer);
  });

  it('remaps OpenGL clip-space Z into WebGPU NDC depth', () => {
    const { fake, state } = makeWgpuSceneState();
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
