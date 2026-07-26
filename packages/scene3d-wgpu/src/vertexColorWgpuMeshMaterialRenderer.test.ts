import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createVertexColorMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { VertexColorMaterialKind } from '@flighthq/types/contract';

import {
  registerVertexColorWgpuMaterial,
  vertexColorWgpuMeshMaterialRenderer,
} from './vertexColorWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

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

describe('registerVertexColorWgpuMaterial', () => {
  it('installs the renderer for VertexColorMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    registerVertexColorWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, VertexColorMaterialKind)).toBe(vertexColorWgpuMeshMaterialRenderer);
  });
});

describe('vertexColorWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and uploads the tint', () => {
    const { fake, state } = makeWgpuScene3DState();
    vertexColorWgpuMeshMaterialRenderer.bind(state, createVertexColorMaterial(), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuScene3DState();
    const proxy = makeProxy();
    vertexColorWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    vertexColorWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
  });
});
