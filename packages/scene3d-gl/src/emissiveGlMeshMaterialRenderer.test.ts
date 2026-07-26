import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createEmissiveMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { EmissiveMaterialKind } from '@flighthq/types/contract';

import { emissiveGlMeshMaterialRenderer, registerEmissiveGlMaterial } from './emissiveGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createEmissiveMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('emissiveGlMeshMaterialRenderer', () => {
  it('bind uploads the emissive color scaled by emissiveStrength via the intensity uniform', () => {
    const { state, gl } = makeGlScene3DState();
    const material = createEmissiveMaterial({ emissiveStrength: 4 });
    emissiveGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    emissiveGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    emissiveGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });
});

describe('registerEmissiveGlMaterial', () => {
  it('installs the renderer for EmissiveMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerEmissiveGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, EmissiveMaterialKind)).toBe(emissiveGlMeshMaterialRenderer);
  });
});
