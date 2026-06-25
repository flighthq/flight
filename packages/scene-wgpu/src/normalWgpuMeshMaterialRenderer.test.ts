import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createNormalMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { NormalMaterialKind } from '@flighthq/types';

import { normalWgpuMeshMaterialRenderer, registerNormalWgpuMaterial } from './normalWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

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
    material: createNormalMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('normalWgpuMeshMaterialRenderer', () => {
  it('bind selects the normal pipeline and writes the frame + material uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    normalWgpuMeshMaterialRenderer.bind(state, createNormalMaterial({ normalScale: 2 }), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    normalWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    normalWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    normalWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});

describe('registerNormalWgpuMaterial', () => {
  it('installs the renderer for NormalMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerNormalWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, NormalMaterialKind)).toBe(normalWgpuMeshMaterialRenderer);
  });
});
