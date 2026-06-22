import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createLambertMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { LambertMaterialKind } from '@flighthq/types';

import { lambertWgpuMeshMaterialRenderer, registerLambertWgpuMaterial } from './lambertWgpuMeshMaterialRenderer';
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
    material: createLambertMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('lambertWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds frame + material groups + uploads uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    lambertWgpuMeshMaterialRenderer.bind(state, createLambertMaterial(), makeLights(), makeCamera());

    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    const geometry = createBoxMeshGeometry();
    lambertWgpuMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    lambertWgpuMeshMaterialRenderer.draw(state, proxy, geometry);

    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
    expect(drawCall!.args[2]).toBe(proxy.subset.indexOffset);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    lambertWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('registerLambertWgpuMaterial', () => {
  it('installs the renderer for LambertMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerLambertWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, LambertMaterialKind)).toBe(lambertWgpuMeshMaterialRenderer);
  });
});
