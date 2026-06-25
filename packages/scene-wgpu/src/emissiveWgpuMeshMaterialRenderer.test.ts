import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createEmissiveMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { EmissiveMaterialKind } from '@flighthq/types';

import { emissiveWgpuMeshMaterialRenderer, registerEmissiveWgpuMaterial } from './emissiveWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
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
    material: createEmissiveMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('emissiveWgpuMeshMaterialRenderer', () => {
  it('bind uploads the emissive color and issues frame + material binds', () => {
    const { fake, state } = makeWgpuSceneState();
    emissiveWgpuMeshMaterialRenderer.bind(
      state,
      createEmissiveMaterial({ emissiveStrength: 3 }),
      NO_LIGHTS,
      makeCamera(),
    );
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    emissiveWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    emissiveWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
  });
});

describe('registerEmissiveWgpuMaterial', () => {
  it('installs the renderer for EmissiveMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerEmissiveWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, EmissiveMaterialKind)).toBe(emissiveWgpuMeshMaterialRenderer);
  });
});
