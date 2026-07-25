import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createAnisotropyPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, Matrix3, Matrix4, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types';
import { AnisotropyPbrMaterialKind } from '@flighthq/types';

import {
  anisotropyPbrGlMeshMaterialRenderer,
  registerAnisotropyPbrGlMaterial,
} from './anisotropyPbrGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): Scene3DLightBlock {
  const data = new Float32Array(12);
  data[1] = -1;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  data[9] = 0.1;
  data[10] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createAnisotropyPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('anisotropyPbrGlMeshMaterialRenderer', () => {
  it('bind uploads the light block, standard block, and anisotropy uniforms', () => {
    const { state, gl } = makeGlScene3DState();
    anisotropyPbrGlMeshMaterialRenderer.bind(
      state,
      createAnisotropyPbrMaterial({ anisotropyRotation: 0.5, anisotropyStrength: 0.7 }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
  });

  it('caches the anisotropy program under the pbr: namespace', () => {
    const { state } = makeGlScene3DState();
    anisotropyPbrGlMeshMaterialRenderer.bind(state, createAnisotropyPbrMaterial(), makeLights(), makeCamera());
    const cache = getGlScene3DRuntime(state).programCache;
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0].startsWith('pbr:')).toBe(true);
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    anisotropyPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    anisotropyPbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlScene3DState();
    anisotropyPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerAnisotropyPbrGlMaterial', () => {
  it('installs the renderer for AnisotropyPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerAnisotropyPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, AnisotropyPbrMaterialKind)).toBe(anisotropyPbrGlMeshMaterialRenderer);
  });
});
