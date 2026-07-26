import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createSheenPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, Matrix3, Matrix4, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { SheenPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerSheenPbrGlMaterial, sheenPbrGlMeshMaterialRenderer } from './sheenPbrGlMeshMaterialRenderer';

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
    material: createSheenPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerSheenPbrGlMaterial', () => {
  it('installs the renderer for SheenPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerSheenPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, SheenPbrMaterialKind)).toBe(sheenPbrGlMeshMaterialRenderer);
  });
});

describe('sheenPbrGlMeshMaterialRenderer', () => {
  it('bind uploads the light block, standard block, and sheen uniforms', () => {
    const { state, gl } = makeGlScene3DState();
    sheenPbrGlMeshMaterialRenderer.bind(
      state,
      createSheenPbrMaterial({ sheenColor: 0x80604000 }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });

  it('caches the sheen program under the pbr: namespace', () => {
    const { state } = makeGlScene3DState();
    sheenPbrGlMeshMaterialRenderer.bind(state, createSheenPbrMaterial(), makeLights(), makeCamera());
    const cache = getGlScene3DRuntime(state).programCache;
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0].startsWith('pbr:')).toBe(true);
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    sheenPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    sheenPbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlScene3DState();
    sheenPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
