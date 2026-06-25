import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy, Texture } from '@flighthq/types';

import {
  buildWgpuPbrStandardDefineKey,
  ensureWgpuPbrMaterialBindGroup,
  getWgpuPbrMaterialScratch,
  standardPbrWgpuMeshMaterialRenderer,
  uploadWgpuPbrMaterialUniform,
  WGPU_PBR_MATERIAL_UNIFORM_FLOATS,
  writeWgpuPbrStandardBlock,
} from './standardPbrWgpuMeshMaterialRenderer';
import { ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(12);
  data[0] = 0;
  data[1] = -1;
  data[2] = 0;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  data[9] = 0.1;
  data[10] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createStandardPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('buildWgpuPbrStandardDefineKey', () => {
  it('reads the alpha mode + double-sidedness and leaves every extension flag off', () => {
    const material = createStandardPbrMaterial();
    material.alphaMode = 'mask';
    material.doubleSided = true;
    const key = buildWgpuPbrStandardDefineKey(material, material);
    expect(key.alphaMaskEnabled).toBe(true);
    expect(key.doubleSided).toBe(true);
    expect(key.clearcoatEnabled).toBe(false);
    expect(key.transmissionEnabled).toBe(false);
  });

  it('returns all-false flags for a null surface', () => {
    const key = buildWgpuPbrStandardDefineKey(null, null);
    expect(key.alphaMaskEnabled).toBe(false);
    expect(key.hasBaseColorMap).toBe(false);
  });

  it('derives the five standard map flags from the material maps that carry an image source', () => {
    const material = createStandardPbrMaterial();
    // A texture is "present" only when it carries a GPU-uploadable image source; a structural stub of
    // exactly that shape is enough to exercise the flag derivation without a real GPU texture upload.
    const sourced = { image: { source: {} } } as unknown as Texture;
    material.baseColorMap = sourced;
    material.metallicRoughnessMap = sourced;
    const key = buildWgpuPbrStandardDefineKey(material, material);
    expect(key.hasBaseColorMap).toBe(true);
    expect(key.hasMetallicRoughnessMap).toBe(true);
    expect(key.hasNormalMap).toBe(false);
    expect(key.hasOcclusionMap).toBe(false);
    expect(key.hasEmissiveMap).toBe(false);
  });
});

describe('ensureWgpuPbrMaterialBindGroup', () => {
  it('creates a material bind group once per key and reuses it', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = ensureWgpuPbrPipeline(state, buildWgpuPbrStandardDefineKey(null, null), 'bgra8unorm');
    const cacheKey = {};
    const a = ensureWgpuPbrMaterialBindGroup(state, pipeline, cacheKey, null);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    const b = ensureWgpuPbrMaterialBindGroup(state, pipeline, cacheKey, null);
    expect(b).toBe(a);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
  });
});

describe('getWgpuPbrMaterialScratch', () => {
  it('returns the shared 48-float MaterialBlock scratch', () => {
    expect(getWgpuPbrMaterialScratch().length).toBe(WGPU_PBR_MATERIAL_UNIFORM_FLOATS);
  });
});

describe('standardPbrWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds frame + material groups + uploads uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    standardPbrWgpuMeshMaterialRenderer.bind(state, createStandardPbrMaterial(), makeLights(), makeCamera());

    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('bind compiles a cull-none pipeline for a double-sided material', () => {
    const { fake, state } = makeWgpuSceneState();
    const material = createStandardPbrMaterial();
    material.doubleSided = true;
    standardPbrWgpuMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    const descriptor = pipelineCall!.args[0] as { primitive: { cullMode: string } };
    expect(descriptor.primitive.cullMode).toBe('none');
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    const geometry = createBoxMeshGeometry();
    standardPbrWgpuMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    standardPbrWgpuMeshMaterialRenderer.draw(state, proxy, geometry);

    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
    expect(drawCall!.args[2]).toBe(proxy.subset.indexOffset);
    expect(fake.calls.some((c) => c.name === 'setIndexBuffer')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setVertexBuffer')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    standardPbrWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('uploadWgpuPbrMaterialUniform', () => {
  it('writes the scratch into the binding buffer', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = ensureWgpuPbrPipeline(state, buildWgpuPbrStandardDefineKey(null, null), 'bgra8unorm');
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, {}, null);
    const writes = fake.calls.filter((c) => c.name === 'writeBuffer').length;
    uploadWgpuPbrMaterialUniform(state, binding);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBe(writes + 1);
  });
});

describe('WGPU_PBR_MATERIAL_UNIFORM_FLOATS', () => {
  it('is the 48-float (192-byte) MaterialBlock size', () => {
    expect(WGPU_PBR_MATERIAL_UNIFORM_FLOATS).toBe(48);
  });
});

describe('writeWgpuPbrStandardBlock', () => {
  it('packs the base color + alpha cutoff, and uses neutral defaults for a null block', () => {
    const out = new Float32Array(WGPU_PBR_MATERIAL_UNIFORM_FLOATS);
    writeWgpuPbrStandardBlock(out, createStandardPbrMaterial({ baseColor: 0xff0000ff }), 0.25);
    expect(out[0]).toBeGreaterThan(0.9); // red channel ~1 in linear
    expect(out[12]).toBe(0.25); // alphaCutoff

    const neutral = new Float32Array(WGPU_PBR_MATERIAL_UNIFORM_FLOATS);
    writeWgpuPbrStandardBlock(neutral, null, 0.5);
    expect(neutral[0]).toBe(1);
    expect(neutral[9]).toBe(1); // roughness default
  });
});
