import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { blinnPhongGlMeshMaterialRenderer, registerGlBlinnPhongMaterial } from './blinnPhongGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): Scene3DLightBlock {
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

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createBlinnPhongMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('blinnPhongGlMeshMaterialRenderer', () => {
  it('bind selects a program, uploads camera position + light block + diffuse/specular colors', () => {
    const { state, gl } = makeGlScene3DState();
    blinnPhongGlMeshMaterialRenderer.bind(state, createBlinnPhongMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    // Light block (2 vec4) + diffuse + specular colors → at least 4 uniform4f.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(4);
    // Camera3D position is a vec3; the ambient radiance is too — at least 2 uniform3f.
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBeGreaterThanOrEqual(2);
  });

  it('bind caches the program under the classic namespace with a blinnphong key', () => {
    const { state } = makeGlScene3DState();
    blinnPhongGlMeshMaterialRenderer.bind(state, createBlinnPhongMaterial(), makeLights(), makeCamera());
    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('classic:b'))).toBe(true);
  });

  it('bind disables back-face culling for a double-sided material', () => {
    const { state, gl } = makeGlScene3DState();
    const material = createBlinnPhongMaterial();
    material.doubleSided = true;
    blinnPhongGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    blinnPhongGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    blinnPhongGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    blinnPhongGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerGlBlinnPhongMaterial', () => {
  it('installs the renderer for BlinnPhongMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlBlinnPhongMaterial(state);
    expect(getGlMeshMaterialRenderer(state, BlinnPhongMaterialKind)).toBe(blinnPhongGlMeshMaterialRenderer);
  });
});
