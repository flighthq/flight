import { createCamera3D } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createCustomShaderMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera3D, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { CustomShaderMaterialKind } from '@flighthq/types';

import {
  customShaderWgpuMeshMaterialRenderer,
  getWgpuCustomMaterialShaderSource,
  registerCustomShaderWgpuMaterial,
  registerWgpuCustomMaterialShader,
} from './customShaderWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

const SOURCE = `
@group(0) @binding(0) var<uniform> frame: vec4f;
@group(1) @binding(0) var<uniform> draw: vec4f;
@group(2) @binding(0) var<uniform> user: vec4f;
@vertex fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return vec4f(position, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return user; }
`;

const NO_LIGHTS: SceneLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeCamera(): Camera3D {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createCustomShaderMaterial({ shaderKey: 'test' }),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('customShaderWgpuMeshMaterialRenderer', () => {
  it('reuses Frame/Draw layouts and binds reserved user + texture groups', () => {
    const { fake, state } = makeWgpuSceneState();
    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    customShaderWgpuMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'test' }),
      NO_LIGHTS,
      makeCamera(),
    );

    const layoutCall = fake.calls.find((call) => call.name === 'createPipelineLayout');
    const descriptor = layoutCall?.args[0] as GPUPipelineLayoutDescriptor;
    expect(descriptor.bindGroupLayouts).toHaveLength(4);
    expect(fake.calls.filter((call) => call.name === 'setBindGroup').map((call) => call.args[0])).toEqual([0, 2, 3]);
  });

  it('packs logical values into alphabetically sorted vec4 slots', () => {
    const { fake, state } = makeWgpuSceneState();
    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    customShaderWgpuMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({
        shaderKey: 'test',
        uniforms: { zeta: [5, 6], alpha: 2 },
      }),
      NO_LIGHTS,
      makeCamera(),
    );

    const write = fake.calls.find((call) => call.name === 'writeBuffer');
    const packed = new Float32Array(write!.args[2] as ArrayBuffer);
    expect(Array.from(packed.slice(0, 8))).toEqual([2, 0, 0, 0, 5, 6, 0, 0]);
  });

  it('draws an indexed subset after a valid bind and skips a missing shader', () => {
    const { fake, state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const proxy = makeProxy();
    customShaderWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    customShaderWgpuMeshMaterialRenderer.draw(state, proxy, geometry);
    expect(fake.calls.some((call) => call.name === 'drawIndexed')).toBe(false);

    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    customShaderWgpuMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    customShaderWgpuMeshMaterialRenderer.draw(state, proxy, geometry);
    expect(fake.calls.some((call) => call.name === 'drawIndexed')).toBe(true);
  });

  it('skips a user block that exceeds the fixed packing capacity', () => {
    const { fake, state } = makeWgpuSceneState();
    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    const uniforms: Record<string, number> = {};
    for (let i = 0; i < 33; i++) uniforms[`value${i}`] = i;
    customShaderWgpuMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'test', uniforms }),
      NO_LIGHTS,
      makeCamera(),
    );
    expect(fake.calls.some((call) => call.name === 'createRenderPipeline')).toBe(false);
  });
});

describe('getWgpuCustomMaterialShaderSource', () => {
  it('returns null for an unknown key', () => {
    const { state } = makeWgpuSceneState();
    expect(getWgpuCustomMaterialShaderSource(state, 'unknown')).toBeNull();
  });
});

describe('registerCustomShaderWgpuMaterial', () => {
  it('installs the renderer for CustomShaderMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    registerCustomShaderWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, CustomShaderMaterialKind)).toBe(customShaderWgpuMeshMaterialRenderer);
  });
});

describe('registerWgpuCustomMaterialShader', () => {
  it('registers WGSL by key with last-write-wins lookup', () => {
    const { state } = makeWgpuSceneState();
    registerWgpuCustomMaterialShader(state, 'ripple', SOURCE);
    expect(getWgpuCustomMaterialShaderSource(state, 'ripple')).toBe(SOURCE);
    registerWgpuCustomMaterialShader(state, 'ripple', `${SOURCE}\n// edited`);
    expect(getWgpuCustomMaterialShaderSource(state, 'ripple')).toContain('edited');
    expect(getWgpuCustomMaterialShaderSource(state, 'missing')).toBeNull();
  });
});
