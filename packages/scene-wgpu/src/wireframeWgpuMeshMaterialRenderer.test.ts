import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createWireframeMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { WireframeMaterialKind } from '@flighthq/types';

import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import { registerWireframeWgpuMaterial, wireframeWgpuMeshMaterialRenderer } from './wireframeWgpuMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createWireframeMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerWireframeWgpuMaterial', () => {
  it('installs the renderer for WireframeMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerWireframeWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, WireframeMaterialKind)).toBe(wireframeWgpuMeshMaterialRenderer);
  });
});

describe('wireframeWgpuMeshMaterialRenderer', () => {
  it('bind selects a line-list pipeline and uploads the color', () => {
    const { fake, state } = makeWgpuSceneState();
    wireframeWgpuMeshMaterialRenderer.bind(state, createWireframeMaterial(), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    expect((pipelineCall!.args[0] as { primitive: { topology: string } }).primitive.topology).toBe('line-list');
  });

  it('draw issues a line-list indexed draw over the doubled subset range', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    wireframeWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wireframeWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount * 2);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    wireframeWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});
