import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createMatcapMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { MatcapMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { matcapGlMeshMaterialRenderer, registerGlMatcapMaterial } from './matcapGlMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createMatcapMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('matcapGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull, view-projection, u_view, and the tint uniform', () => {
    const { state, gl } = makeGlScene3DState();
    matcapGlMeshMaterialRenderer.bind(state, createMatcapMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    // The view-projection and u_view are both mat4 uploads.
    expect(gl.calls.filter((c) => c.name === 'uniformMatrix4fv').length).toBeGreaterThanOrEqual(2);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    matcapGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    matcapGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    matcapGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerGlMatcapMaterial', () => {
  it('installs the renderer for MatcapMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlMatcapMaterial(state);
    expect(getGlMeshMaterialRenderer(state, MatcapMaterialKind)).toBe(matcapGlMeshMaterialRenderer);
  });
});
