import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createEmissiveMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { EmissiveMaterialKind } from '@flighthq/types';

import { emissiveGlMeshMaterialRenderer, registerEmissiveGlMaterial } from './emissiveGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
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
    const { state, gl } = makeGlSceneState();
    const material = createEmissiveMaterial({ emissiveStrength: 4 });
    emissiveGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    emissiveGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    emissiveGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });
});

describe('registerEmissiveGlMaterial', () => {
  it('installs the renderer for EmissiveMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerEmissiveGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, EmissiveMaterialKind)).toBe(emissiveGlMeshMaterialRenderer);
  });
});
