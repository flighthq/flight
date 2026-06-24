import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createToonMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { ToonMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';
import { registerToonGlMaterial, toonGlMeshMaterialRenderer } from './toonGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  // Directional { dir.xyz @0, _pad, radiance.rgb @4, _pad } + ambient { radiance.rgb @8 }.
  const data = new Float32Array(12);
  data[0] = 0;
  data[1] = -1;
  data[2] = 0;
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
    material: createToonMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerToonGlMaterial', () => {
  it('installs the renderer for ToonMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerToonGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, ToonMaterialKind)).toBe(toonGlMeshMaterialRenderer);
  });
});

describe('toonGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull state, and uploads camera + light block + base color', () => {
    const { state, gl } = makeGlSceneState();
    toonGlMeshMaterialRenderer.bind(state, createToonMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'depthFunc' && c.args[0] === gl.LESS)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.CULL_FACE)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    // Light block: directional + directional-radiance (uniform4f x2), ambient (uniform3f + camera
    // position uniform3f), the two count gates (uniform1f), plus the base color (uniform4f).
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(3);
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBeGreaterThanOrEqual(2);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
  });

  it('bind disables back-face culling for a double-sided material', () => {
    const { state, gl } = makeGlSceneState();
    const material = createToonMaterial();
    material.doubleSided = true;
    toonGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    const geometry = createBoxMeshGeometry();
    toonGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    toonGlMeshMaterialRenderer.draw(state, proxy, geometry);

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    toonGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
