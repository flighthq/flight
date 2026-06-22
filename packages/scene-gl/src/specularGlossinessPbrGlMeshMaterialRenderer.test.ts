import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createSpecularGlossinessPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import {
  registerSpecularGlossinessPbrGlMaterial,
  specularGlossinessPbrGlMeshMaterialRenderer,
} from './specularGlossinessPbrGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(12);
  data[1] = -1;
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
    material: createSpecularGlossinessPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerSpecularGlossinessPbrGlMaterial', () => {
  it('installs the renderer for SpecularGlossinessPbrMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerSpecularGlossinessPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, SpecularGlossinessPbrMaterialKind)).toBe(
      specularGlossinessPbrGlMeshMaterialRenderer,
    );
  });
});

describe('specularGlossinessPbrGlMeshMaterialRenderer', () => {
  it('bind converts spec-gloss to a standard block and uploads it through the base PBR program', () => {
    const { state, gl } = makeGlSceneState();
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
    const { state } = makeGlSceneState();
    specularGlossinessPbrGlMeshMaterialRenderer.bind(
      state,
      createSpecularGlossinessPbrMaterial(),
      makeLights(),
      makeCamera(),
    );
    const cache = getGlSceneRuntime(state).programCache;
    expect(cache.size).toBe(1);
    const key = [...cache.keys()][0];
    expect(key.startsWith('pbr:')).toBe(true);
    // The extension half of the key (after ':') is all dashes — no extension lobe enabled.
    expect(key.split(':')[2]).toBe('-------');
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    specularGlossinessPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    specularGlossinessPbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlSceneState();
    specularGlossinessPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
