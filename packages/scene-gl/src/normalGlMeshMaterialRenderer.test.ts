import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createNormalMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { NormalMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';
import { normalGlMeshMaterialRenderer, registerNormalGlMaterial } from './normalGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createNormalMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('normalGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull, view-projection, and the normal scale uniform', () => {
    const { state, gl } = makeGlSceneState();
    normalGlMeshMaterialRenderer.bind(state, createNormalMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    normalGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    normalGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    normalGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerNormalGlMaterial', () => {
  it('installs the renderer for NormalMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerNormalGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, NormalMaterialKind)).toBe(normalGlMeshMaterialRenderer);
  });
});
