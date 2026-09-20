import { createCamera3D, createPerspectiveProjection } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createWireframeMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy, WgpuSkinningAdapter } from '@flighthq/types/contract';
import { WireframeMaterialKind } from '@flighthq/types/contract';

import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { wgpuSkinningAdapter } from './wgpuSkinPalette';
import { registerWgpuWireframeMaterial, wgpuWireframeMeshMaterialRenderer } from './wgpuWireframeMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
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

describe('registerWgpuWireframeMaterial', () => {
  it('installs the renderer for WireframeMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuWireframeMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, WireframeMaterialKind)).toBe(wgpuWireframeMeshMaterialRenderer);
  });
});

describe('wgpuWireframeMeshMaterialRenderer', () => {
  it('bind selects a line-list pipeline and uploads the color', () => {
    const { fake, state } = makeWgpuScene3DState();
    wgpuWireframeMeshMaterialRenderer.bind(state, createWireframeMaterial(), NO_LIGHTS, makeCamera());
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    expect((pipelineCall!.args[0] as { primitive: { topology: string } }).primitive.topology).toBe('line-list');
  });

  it('bind selects the alpha-mask pipeline for a masked material', () => {
    const { state } = makeWgpuScene3DState();
    const material = createWireframeMaterial({ alphaCutoff: 0.25, alphaMode: 'mask' });
    wgpuWireframeMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect([...getWgpuScene3DRuntime(state).pipelineCache.keys()].some((key) => key.includes('|mask|'))).toBe(true);
  });

  it('draw issues a line-list indexed draw over the doubled subset range', () => {
    const { fake, state } = makeWgpuScene3DState();
    const proxy = makeProxy();
    wgpuWireframeMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wgpuWireframeMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount * 2);
  });

  it('draw binds the palette-backed group selected by a skinned pipeline', () => {
    const { fake, state } = makeWgpuScene3DState();
    const runtime = getWgpuScene3DRuntime(state);
    const skinGroup = {} as GPUBindGroup;
    let skinGroupCalls = 0;
    runtime.skinningAdapter = {
      ...wgpuSkinningAdapter,
      getMeshDrawBindGroup: () => {
        skinGroupCalls++;
        return skinGroup;
      },
    } satisfies WgpuSkinningAdapter;
    runtime.activeSkinnedRun = true;
    const base = makeProxy();
    const proxy: Scene3DRenderProxy = {
      ...base,
      jointMatrices: new Float32Array(16),
      normalMatrices: new Float32Array(12),
    };

    wgpuWireframeMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    wgpuWireframeMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    expect(skinGroupCalls).toBe(1);
    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 1 && c.args[1] === skinGroup)).toBe(true);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuScene3DState();
    wgpuWireframeMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});
