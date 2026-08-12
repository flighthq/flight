import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createWireframeMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { WireframeMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { SKIN_PALETTE_TEXTURE_UNIT } from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
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

  it('bind selects the masked program and uploads alphaCutoff', () => {
    const { state, gl } = makeGlScene3DState();
    const material = createWireframeMaterial({ alphaCutoff: 0.25, alphaMode: 'mask' });
    wireframeGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.25)).toBe(true);
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

  // This family binds its own line-index VAO and bypasses drawGlMeshSubset, which is where every other
  // family gets its per-draw object alpha. While that upload was only inside drawGlMeshSubset the
  // wireframe shader read u_objectAlpha = 0, harmless until the fragment tail began premultiplying rgb
  // by alpha and turned the whole frame black.
  it('draw uploads the per-draw object alpha it cannot get from drawGlMeshSubset', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    proxy.alpha = 0.5;
    wireframeGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wireframeGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.5)).toBe(true);
  });

  it('draw binds the bone palette consumed by the skinned line variant', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    proxy.jointMatrices = new Float32Array(16);
    proxy.normalMatrices = new Float32Array(12);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    wireframeGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wireframeGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    expect(
      gl.calls.some((c) => c.name === 'activeTexture' && c.args[0] === gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT),
    ).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1i' && c.args[1] === SKIN_PALETTE_TEXTURE_UNIT)).toBe(true);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    wireframeGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
