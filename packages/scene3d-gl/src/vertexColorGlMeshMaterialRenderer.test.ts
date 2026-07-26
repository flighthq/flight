import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createVertexColorMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { VertexColorMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerVertexColorGlMaterial, vertexColorGlMeshMaterialRenderer } from './vertexColorGlMeshMaterialRenderer';

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
    material: createVertexColorMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerVertexColorGlMaterial', () => {
  it('installs the renderer for VertexColorMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerVertexColorGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, VertexColorMaterialKind)).toBe(vertexColorGlMeshMaterialRenderer);
  });
});

describe('vertexColorGlMeshMaterialRenderer', () => {
  it('bind compiles the vertex-color variant and uploads the tint', () => {
    const { state, gl } = makeGlScene3DState();
    vertexColorGlMeshMaterialRenderer.bind(state, createVertexColorMaterial(), NO_LIGHTS, makeCamera());
    const shaderSources = gl.calls.filter((c) => c.name === 'shaderSource').map((c) => c.args[1] as string);
    expect(shaderSources.some((s) => s.includes('#define VERTEX_COLOR'))).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    vertexColorGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    vertexColorGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });
});
