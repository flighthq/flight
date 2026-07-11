import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy, Texture } from '@flighthq/types';

import {
  beginWgpuMeshDraw,
  createWgpuMeshPipeline,
  drawWgpuMeshSubset,
  ensureWgpuFrameBindGroup,
  ensureWgpuIblSampleBindGroup,
  ensureWgpuIblSampleLayout,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuSceneLayouts,
  ensureWgpuScenePipeline,
  ensureWgpuShadowSampleBindGroup,
  ensureWgpuShadowSampleLayout,
  isWgpuTextureReady,
  resolveWgpuMaterialTextureView,
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

describe('WGPU_MESH_PRELUDE_WGSL', () => {
  it('declares the shared Frame + Draw structs and the vertex entry', () => {
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Frame');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('struct Draw');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('fn vs_main');
    expect(WGPU_MESH_PRELUDE_WGSL).toContain('srgbToLinear');
  });
});

describe('writeWgpuDrawUniform', () => {
  it('writes the draw uniform and returns the dynamic-offset bind group', () => {
    const { state } = makeWgpuSceneState();
    const group = writeWgpuDrawUniform(state, makeProxy());
    expect(group).toBeDefined();
    expect(getWgpuSceneRuntime(state).pendingDrawOffset).toBe(0);
  });
});

describe('writeWgpuFrameUniform', () => {
  it('writes the frame uniform buffer', () => {
    const { fake, state } = makeWgpuSceneState();
    writeWgpuFrameUniform(state, makeCamera(), makeLights());
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});
