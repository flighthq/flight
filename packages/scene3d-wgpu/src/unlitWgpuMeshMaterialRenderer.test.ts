import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { registerWgpuImageTextureResolver } from '@flighthq/render-wgpu/contract';
import { advanceVideoTexture, createVideoTexture } from '@flighthq/texture/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { UnlitMaterialKind } from '@flighthq/types/contract';
import { createVideoResource } from '@flighthq/video/contract';

import { registerWgpuUnlitMaterial, unlitWgpuMeshMaterialRenderer } from './unlitWgpuMeshMaterialRenderer';
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
    material: createUnlitMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerWgpuUnlitMaterial', () => {
  it('installs the renderer for UnlitMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuUnlitMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, UnlitMaterialKind)).toBe(unlitWgpuMeshMaterialRenderer);
  });
});

describe('unlitWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds the frame + material groups', () => {
    const { fake, state } = makeWgpuScene3DState();
    unlitWgpuMeshMaterialRenderer.bind(state, createUnlitMaterial(), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
  });

  it('uploads a ready dynamic video map into the color-map slot', () => {
    const { fake, state } = makeWgpuScene3DState();
    const material = createUnlitMaterial();
    const element = document.createElement('video');
    Object.defineProperties(element, {
      readyState: { value: 4 },
      videoHeight: { value: 120 },
      videoWidth: { value: 160 },
    });
    material.baseColorMap = createVideoTexture(createVideoResource(element));
    advanceVideoTexture(material.baseColorMap);
    registerWgpuImageTextureResolver(state);
    unlitWgpuMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'copyExternalImageToTexture')).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { fake, state } = makeWgpuScene3DState();
    const proxy = makeProxy();
    unlitWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    unlitWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuScene3DState();
    unlitWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});
