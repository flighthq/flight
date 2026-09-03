import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createSpecularGlossinessPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Matrix3, Matrix4, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { SpecularGlossinessPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import {
  registerGlSpecularGlossinessPbrMaterial,
  specularGlossinessPbrGlMeshMaterialRenderer,
} from './specularGlossinessPbrGlMeshMaterialRenderer';

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
    material: createSpecularGlossinessPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerGlSpecularGlossinessPbrMaterial', () => {
  it('installs the renderer for SpecularGlossinessPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlSpecularGlossinessPbrMaterial(state);
    expect(getGlMeshMaterialRenderer(state, SpecularGlossinessPbrMaterialKind)).toBe(
      specularGlossinessPbrGlMeshMaterialRenderer,
    );
  });
});

describe('specularGlossinessPbrGlMeshMaterialRenderer', () => {
  it('bind converts spec-gloss to a standard block and uploads it through the base PBR program', () => {
    const { state, gl } = makeGlScene3DState();
    specularGlossinessPbrGlMeshMaterialRenderer.bind(
      state,
      createSpecularGlossinessPbrMaterial({ diffuse: 0xc08040ff, glossiness: 0.7, specular: 0x404040ff }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });

  it('binds the base PBR program (no extension define) under the pbr: namespace', () => {
    const { state } = makeGlScene3DState();
    specularGlossinessPbrGlMeshMaterialRenderer.bind(
      state,
      createSpecularGlossinessPbrMaterial(),
      makeLights(),
      makeCamera(),
    );
    const cache = getGlScene3DRuntime(state).programCache;
    expect(cache.size).toBe(1);
    const key = [...cache.keys()][0];
    expect(key.startsWith('pbr:')).toBe(true);
    // The standard renderer contributes no extension identity; the only post-colon standard slot is
    // the unset skin flag.
    expect(key.split(':')[2]).toBe('--');
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    specularGlossinessPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    specularGlossinessPbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlScene3DState();
    specularGlossinessPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
