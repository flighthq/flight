import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createToonMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { ToonMaterialKind } from '@flighthq/types';

import { registerToonWgpuMaterial, toonWgpuMeshMaterialRenderer } from './toonWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
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
  return { ambientCount: 1, data, directionalCount: 1, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createToonMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerToonWgpuMaterial', () => {
  it('installs the toon renderer for ToonMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerToonWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, ToonMaterialKind)).toBe(toonWgpuMeshMaterialRenderer);
  });
});

describe('toonWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds frame + material groups + uploads uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    toonWgpuMeshMaterialRenderer.bind(state, createToonMaterial(), makeLights(), makeCamera());

    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('bind compiles a cull-none pipeline for a double-sided material', () => {
    const { fake, state } = makeWgpuSceneState();
    const material = createToonMaterial();
    material.doubleSided = true;
    toonWgpuMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    const descriptor = pipelineCall!.args[0] as { primitive: { cullMode: string } };
    expect(descriptor.primitive.cullMode).toBe('none');
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    const geometry = createBoxMeshGeometry();
    toonWgpuMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    toonWgpuMeshMaterialRenderer.draw(state, proxy, geometry);

    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
    expect(drawCall!.args[2]).toBe(proxy.subset.indexOffset);
    expect(fake.calls.some((c) => c.name === 'setIndexBuffer')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setVertexBuffer')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    toonWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});
