import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';

import {
  beginWgpuMeshDraw,
  createWgpuMeshPipeline,
  drawWgpuMeshSubset,
  ensureWgpuFrameBindGroup,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuSceneLayouts,
  ensureWgpuScenePipeline,
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
  return { ambientCount: 1, data, directionalCount: 1, version: 1 };
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
});

describe('createWgpuMeshPipeline', () => {
  it('builds a pipeline over the shared frame + draw layouts', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = makePipeline(state);
    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    const layoutCall = fake.calls.find((c) => c.name === 'createPipelineLayout');
    expect((layoutCall!.args[0] as { bindGroupLayouts: unknown[] }).bindGroupLayouts.length).toBe(3);
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
