import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createTransmissionVolumePbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { TransmissionVolumePbrMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import {
  registerTransmissionVolumePbrGlMaterial,
  transmissionVolumePbrGlMeshMaterialRenderer,
} from './transmissionVolumePbrGlMeshMaterialRenderer';

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
    material: createTransmissionVolumePbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerTransmissionVolumePbrGlMaterial', () => {
  it('installs the renderer for TransmissionVolumePbrMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerTransmissionVolumePbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, TransmissionVolumePbrMaterialKind)).toBe(
      transmissionVolumePbrGlMeshMaterialRenderer,
    );
  });
});

describe('transmissionVolumePbrGlMeshMaterialRenderer', () => {
  it('bind uploads the light block, standard block, and transmission uniforms', () => {
    const { state, gl } = makeGlSceneState();
    transmissionVolumePbrGlMeshMaterialRenderer.bind(
      state,
      createTransmissionVolumePbrMaterial({ attenuationColor: 0x80c0ffff, transmission: 0.9 }),
      makeLights(),
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });

  it('caches the transmission program under the pbr: namespace', () => {
    const { state } = makeGlSceneState();
    transmissionVolumePbrGlMeshMaterialRenderer.bind(
      state,
      createTransmissionVolumePbrMaterial(),
      makeLights(),
      makeCamera(),
    );
    const cache = getGlSceneRuntime(state).programCache;
    expect(cache.size).toBe(1);
    expect([...cache.keys()][0].startsWith('pbr:')).toBe(true);
  });

  it('draw issues an indexed draw after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    transmissionVolumePbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    transmissionVolumePbrGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draw is a no-op before bind', () => {
    const { state, gl } = makeGlSceneState();
    transmissionVolumePbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
