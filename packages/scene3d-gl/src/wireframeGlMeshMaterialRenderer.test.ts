import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createWireframeMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { WireframeMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlWireframeMaterial, wireframeGlMeshMaterialRenderer } from './wireframeGlMeshMaterialRenderer';

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
    material: createWireframeMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerGlWireframeMaterial', () => {
  it('installs the renderer for WireframeMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlWireframeMaterial(state);
    expect(getGlMeshMaterialRenderer(state, WireframeMaterialKind)).toBe(wireframeGlMeshMaterialRenderer);
  });
});

describe('wireframeGlMeshMaterialRenderer', () => {
  it('bind selects the program, disables culling, and uploads the line color', () => {
    const { state, gl } = makeGlScene3DState();
    wireframeGlMeshMaterialRenderer.bind(state, createWireframeMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues a LINES draw over the derived line range', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    wireframeGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wireframeGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    // Line index count = triangle index count * 2.
    expect(draw!.args[1]).toBe(proxy.subset.indexCount * 2);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    wireframeGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
