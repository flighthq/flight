import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createVertexColorMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { VertexColorMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';
import { registerVertexColorGlMaterial, vertexColorGlMeshMaterialRenderer } from './vertexColorGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeProxy(): SceneRenderProxy {
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
    const { state } = makeGlSceneState();
    registerVertexColorGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, VertexColorMaterialKind)).toBe(vertexColorGlMeshMaterialRenderer);
  });
});

describe('vertexColorGlMeshMaterialRenderer', () => {
  it('bind compiles the vertex-color variant and uploads the tint', () => {
    const { state, gl } = makeGlSceneState();
    vertexColorGlMeshMaterialRenderer.bind(state, createVertexColorMaterial(), NO_LIGHTS, makeCamera());
    const shaderSources = gl.calls.filter((c) => c.name === 'shaderSource').map((c) => c.args[1] as string);
    expect(shaderSources.some((s) => s.includes('#define VERTEX_COLOR'))).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    vertexColorGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    vertexColorGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });
});
