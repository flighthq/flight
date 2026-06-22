import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { UnlitMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';
import { registerUnlitGlMaterial, unlitGlMeshMaterialRenderer } from './unlitGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createUnlitMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerUnlitGlMaterial', () => {
  it('installs the renderer for UnlitMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerUnlitGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, UnlitMaterialKind)).toBe(unlitGlMeshMaterialRenderer);
  });
});

describe('unlitGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull, view-projection, and the color uniform', () => {
    const { state, gl } = makeGlSceneState();
    unlitGlMeshMaterialRenderer.bind(state, createUnlitMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    unlitGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    unlitGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    unlitGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
