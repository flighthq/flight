import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createMatcapMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { MatcapMaterialKind } from '@flighthq/types';

import { matcapWgpuMeshMaterialRenderer, registerMatcapWgpuMaterial } from './matcapWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createMatcapMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('matcapWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds the frame + material groups', () => {
    const { fake, state } = makeWgpuSceneState();
    matcapWgpuMeshMaterialRenderer.bind(state, createMatcapMaterial(), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    matcapWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    matcapWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    matcapWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('registerMatcapWgpuMaterial', () => {
  it('installs the renderer for MatcapMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerMatcapWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, MatcapMaterialKind)).toBe(matcapWgpuMeshMaterialRenderer);
  });
});
