import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createPhongMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { PhongMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import { phongGlMeshMaterialRenderer, registerPhongGlMaterial } from './phongGlMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
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
    material: createPhongMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('phongGlMeshMaterialRenderer', () => {
  it('bind selects a program, uploads camera position + light block + diffuse/specular colors', () => {
    const { state, gl } = makeGlSceneState();
    phongGlMeshMaterialRenderer.bind(state, createPhongMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    // Light block (2 vec4) + diffuse + specular colors → at least 4 uniform4f.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(4);
    // Camera3D position is a vec3; the ambient radiance is too — at least 2 uniform3f.
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBeGreaterThanOrEqual(2);
  });

  it('bind caches the program under the classic namespace with a phong key', () => {
    const { state } = makeGlSceneState();
    phongGlMeshMaterialRenderer.bind(state, createPhongMaterial(), makeLights(), makeCamera());
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('classic:p'))).toBe(true);
  });

  it('bind disables back-face culling for a double-sided material', () => {
    const { state, gl } = makeGlSceneState();
    const material = createPhongMaterial();
    material.doubleSided = true;
    phongGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    phongGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    phongGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    phongGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerPhongGlMaterial', () => {
  it('installs the renderer for PhongMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerPhongGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, PhongMaterialKind)).toBe(phongGlMeshMaterialRenderer);
  });
});
