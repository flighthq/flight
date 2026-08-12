import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createDepthMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { DepthMaterialKind } from '@flighthq/types/contract';

import { depthGlMeshMaterialRenderer, registerGlDepthMaterial } from './depthGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

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
    material: createDepthMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('depthGlMeshMaterialRenderer', () => {
  it('bind selects a program and uploads depth state, view matrices, and the near/far range', () => {
    const { state, gl } = makeGlScene3DState();
    const camera = makeCamera();
    depthGlMeshMaterialRenderer.bind(state, createDepthMaterial(), NO_LIGHTS, camera);
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    const matrixUploads = gl.calls.filter((c) => c.name === 'uniformMatrix4fv');
    expect(matrixUploads.length).toBe(2);
    expect(matrixUploads.some((c) => c.args[2] === camera.view.m)).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    depthGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    depthGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    depthGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('registerGlDepthMaterial', () => {
  it('installs the renderer for DepthMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlDepthMaterial(state);
    expect(getGlMeshMaterialRenderer(state, DepthMaterialKind)).toBe(depthGlMeshMaterialRenderer);
  });
});
