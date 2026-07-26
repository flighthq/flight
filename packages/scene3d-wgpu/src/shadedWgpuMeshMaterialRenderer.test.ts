import { createCamera3D } from '@flighthq/camera/contract';
import { createShadedMaterial } from '@flighthq/shading/contract';
import type { Scene3DLightBlock } from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import {
  getWgpuShadedBaseFlags,
  registerShadedWgpuMaterial,
  shadedWgpuMeshMaterialRenderer,
} from './shadedWgpuMeshMaterialRenderer';

describe('getWgpuShadedBaseFlags', () => {
  it('resolves the base pipeline flags from a material', () => {
    const material = createShadedMaterial();
    material.alphaMode = 'mask';
    material.doubleSided = true;
    expect(getWgpuShadedBaseFlags(material)).toEqual({
      alphaMaskEnabled: true,
      doubleSided: true,
      hasDiffuseMap: false,
      hasNormalMap: false,
      hasSpecularMap: false,
    });
  });
});
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('registerShadedWgpuMaterial', () => {
  it('installs the renderer for ShadedMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    registerShadedWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, ShadedMaterialKind)).toBe(shadedWgpuMeshMaterialRenderer);
  });
});

describe('shadedWgpuMeshMaterialRenderer', () => {
  it('bind compiles a shaded module and binds frame, material, and sample groups', () => {
    const { fake, state } = makeWgpuScene3DState();
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
    });
    shadedWgpuMeshMaterialRenderer.bind(state, createShadedMaterial(), LIGHTS, camera);
    const module = fake.calls.find((call) => call.name === 'createShaderModule');
    expect(module).toBeDefined();
    expect((module!.args[0] as { code: string }).code).toContain('struct ClassicMaterial');
    expect((module!.args[0] as { code: string }).code).not.toContain('modifierData');
    expect(fake.calls.some((call) => call.name === 'setPipeline')).toBe(true);
    expect(fake.calls.filter((call) => call.name === 'setBindGroup').length).toBeGreaterThanOrEqual(3);
  });
});

const LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(128),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};
