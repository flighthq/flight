import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createDepthMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { DepthMaterialKind } from '@flighthq/types';

import { depthWgpuMeshMaterialRenderer, registerDepthWgpuMaterial } from './depthWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = { ambientCount: 0, data: new Float32Array(12), directionalCount: 0, version: 1 };

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createDepthMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('depthWgpuMeshMaterialRenderer', () => {
  it('bind selects the depth pipeline and writes the frame + material uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    depthWgpuMeshMaterialRenderer.bind(state, createDepthMaterial({ far: 50, near: 1 }), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    depthWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    depthWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    depthWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('registerDepthWgpuMaterial', () => {
  it('installs the renderer for DepthMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerDepthWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, DepthMaterialKind)).toBe(depthWgpuMeshMaterialRenderer);
  });
});
