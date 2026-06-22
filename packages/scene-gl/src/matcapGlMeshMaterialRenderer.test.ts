import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createMatcapMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { MatcapMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';
import { matcapGlMeshMaterialRenderer, registerMatcapGlMaterial } from './matcapGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
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
    const { state, gl } = makeGlSceneState();
    matcapGlMeshMaterialRenderer.bind(state, createMatcapMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    // The view-projection and u_view are both mat4 uploads.
    expect(gl.calls.filter((c) => c.name === 'uniformMatrix4fv').length).toBeGreaterThanOrEqual(2);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    matcapGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    matcapGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    matcapGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerMatcapGlMaterial', () => {
  it('installs the renderer for MatcapMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerMatcapGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, MatcapMaterialKind)).toBe(matcapGlMeshMaterialRenderer);
  });
});
