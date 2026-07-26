import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createSpecularPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Matrix3, Matrix4, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { SpecularPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerSpecularPbrGlMaterial, specularPbrGlMeshMaterialRenderer } from './specularPbrGlMeshMaterialRenderer';

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
    material: createSpecularPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerSpecularPbrGlMaterial', () => {
  it('installs the renderer for SpecularPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerSpecularPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, SpecularPbrMaterialKind)).toBe(specularPbrGlMeshMaterialRenderer);
  });
});

describe('specularPbrGlMeshMaterialRenderer', () => {
  it('bind uploads the light block, standard block, and specular uniforms', () => {
    const { state, gl } = makeGlScene3DState();
    specularPbrGlMeshMaterialRenderer.bind(
      state,
      createSpecularPbrMaterial({ specular: 0.8, specularColor: 0x80a0c000 }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });

  it('caches the specular program under the pbr: namespace', () => {
    const { state } = makeGlScene3DState();
    specularPbrGlMeshMaterialRenderer.bind(state, createSpecularPbrMaterial(), makeLights(), makeCamera());
    const cache = getGlScene3DRuntime(state).programCache;
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0].startsWith('pbr:')).toBe(true);
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    specularPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    specularPbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlScene3DState();
    specularPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
