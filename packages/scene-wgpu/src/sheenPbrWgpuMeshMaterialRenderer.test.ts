import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createSheenPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { SheenPbrMaterialKind } from '@flighthq/types';

import { registerSheenPbrWgpuMaterial, sheenPbrWgpuMeshMaterialRenderer } from './sheenPbrWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(12);
  data[1] = -1;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  data[9] = 0.1;
  data[10] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createSheenPbrMaterial({ sheenColor: 0xffffffff }),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('registerSheenPbrWgpuMaterial', () => {
  it('installs the renderer for SheenPbrMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerSheenPbrWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, SheenPbrMaterialKind)).toBe(sheenPbrWgpuMeshMaterialRenderer);
  });
});

describe('sheenPbrWgpuMeshMaterialRenderer', () => {
  it('bind selects a pipeline and binds frame + material groups + uploads uniforms', () => {
    const { fake, state } = makeWgpuSceneState();
    sheenPbrWgpuMeshMaterialRenderer.bind(
      state,
      createSheenPbrMaterial({ sheenColor: 0xffffffff }),
      makeLights(),
      makeCamera(),
    );

    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((c) => c.name === 'setBindGroup').length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });

  it('bind compiles the SHEEN extension variant', () => {
    const { fake, state } = makeWgpuSceneState();
    sheenPbrWgpuMeshMaterialRenderer.bind(state, createSheenPbrMaterial(), makeLights(), makeCamera());
    const moduleCall = fake.calls.find((c) => c.name === 'createShaderModule');
    const code = (moduleCall!.args[0] as { code: string }).code;
    expect(code).toContain('const SHEEN : bool = true;');
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { fake, state } = makeWgpuSceneState();
    const proxy = makeProxy();
    sheenPbrWgpuMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    sheenPbrWgpuMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = fake.calls.find((c) => c.name === 'drawIndexed');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(proxy.subset.indexCount);
    expect(drawCall!.args[2]).toBe(proxy.subset.indexOffset);
  });

  it('draw is a no-op when bind has not selected a pipeline', () => {
    const { fake, state } = makeWgpuSceneState();
    sheenPbrWgpuMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
  });
});
