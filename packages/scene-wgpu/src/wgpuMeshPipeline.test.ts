import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createTexture, setTextureUvOffset, setTextureUvScale } from '@flighthq/texture';
import type { Camera, ImageResource, SceneLightBlock, SceneRenderProxy, Texture } from '@flighthq/types';

import {
  beginWgpuMeshDraw,
  createWgpuMeshPipeline,
  drawWgpuMeshSubset,
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
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
  WGPU_MESH_PRELUDE_WGSL,
  writeWgpuDrawUniform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(12);
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

describe('isWgpuTextureReady', () => {
  it('is true only when the texture carries an uploadable image source', () => {
    expect(isWgpuTextureReady(null)).toBe(false);
    expect(isWgpuTextureReady({ image: null } as unknown as Texture)).toBe(false);
    expect(isWgpuTextureReady({ image: { source: null } } as unknown as Texture)).toBe(false);
    expect(isWgpuTextureReady({ image: { source: {} } } as unknown as Texture)).toBe(true);
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

  it('applies the uv transform in the shared vertex stage', () => {
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('uvTransform : mat3x3f');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('draw.uvTransform * vec3f(uv, 1.0)');
  });
});

describe('writeWgpuDrawUniform', () => {
  it('writes the draw uniform and returns the dynamic-offset bind group', () => {
    const { state } = makeWgpuSceneState();
    const group = writeWgpuDrawUniform(state, makeProxy());
    expect(group).toBeDefined();
    expect(getWgpuSceneRuntime(state).pendingDrawOffset).toBe(0);
  });

  it('folds the stashed uv transform into the draw uniform then resets the stash to identity', () => {
    const { state } = makeWgpuSceneState();
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 2, 3);
    stashWgpuUvTransform(state, texture);

    writeWgpuDrawUniform(state, makeProxy());

    // The uvTransform occupies floats 28..39 (3 padded vec4) after world (0..15) + normalMatrix (16..27).
    const u = getWgpuRenderStateRuntime(state).uniformData;
    expect([u[28], u[29], u[30]].map((n) => n + 0)).toEqual([2, 0, 0]);
    expect([u[32], u[33], u[34]].map((n) => n + 0)).toEqual([0, 3, 0]);
    // Consumed: the stash is back to identity so a following draw without a stash gets the untiled uv.
    expect(Array.from(getWgpuSceneRuntime(state).pendingUvTransform)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('writeWgpuFrameUniform', () => {
  it('writes the frame uniform buffer', () => {
    const { fake, state } = makeWgpuSceneState();
    writeWgpuFrameUniform(state, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});
