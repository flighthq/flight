import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createSubsurfacePbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { SubsurfacePbrMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import {
  registerSubsurfacePbrGlMaterial,
  subsurfacePbrGlMeshMaterialRenderer,
} from './subsurfacePbrGlMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
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
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createSubsurfacePbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerSubsurfacePbrGlMaterial', () => {
  it('installs the renderer for SubsurfacePbrMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerSubsurfacePbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, SubsurfacePbrMaterialKind)).toBe(subsurfacePbrGlMeshMaterialRenderer);
  });
});

describe('subsurfacePbrGlMeshMaterialRenderer', () => {
  it('bind uploads the light block, standard block, and subsurface uniforms', () => {
    const { state, gl } = makeGlSceneState();
    subsurfacePbrGlMeshMaterialRenderer.bind(
      state,
      createSubsurfacePbrMaterial({ subsurface: 0.6, subsurfaceColor: 0xc06040ff, thickness: 0.3 }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });

  it('caches the subsurface program under the pbr: namespace', () => {
    const { state } = makeGlSceneState();
    subsurfacePbrGlMeshMaterialRenderer.bind(state, createSubsurfacePbrMaterial(), makeLights(), makeCamera());
    const cache = getGlSceneRuntime(state).programCache;
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0].startsWith('pbr:')).toBe(true);
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    subsurfacePbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    subsurfacePbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlSceneState();
    subsurfacePbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
