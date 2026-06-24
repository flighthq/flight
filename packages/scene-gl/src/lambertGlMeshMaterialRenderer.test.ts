import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createLambertMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { LambertMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import { lambertGlMeshMaterialRenderer, registerLambertGlMaterial } from './lambertGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  // Directional { dir.xyz @0, _pad, radiance.rgb @4, _pad } + ambient { radiance.rgb @8 }.
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
    material: createLambertMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('lambertGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull, and uploads light block + diffuse color', () => {
    const { state, gl } = makeGlSceneState();
    lambertGlMeshMaterialRenderer.bind(state, createLambertMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.CULL_FACE)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    // The light block uploads two vec4 (directional + radiance) and the diffuse color adds a third.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(3);
  });

  it('bind caches the program under the classic namespace with a lambert key', () => {
    const { state } = makeGlSceneState();
    lambertGlMeshMaterialRenderer.bind(state, createLambertMaterial(), makeLights(), makeCamera());
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('classic:l'))).toBe(true);
  });

  it('bind disables back-face culling for a double-sided material', () => {
    const { state, gl } = makeGlSceneState();
    const material = createLambertMaterial();
    material.doubleSided = true;
    lambertGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    lambertGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    lambertGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    lambertGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerLambertGlMaterial', () => {
  it('installs the renderer for LambertMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerLambertGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, LambertMaterialKind)).toBe(lambertGlMeshMaterialRenderer);
  });
});
