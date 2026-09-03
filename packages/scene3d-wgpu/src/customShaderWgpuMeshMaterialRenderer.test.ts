import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createCustomShaderMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import {
  createWgpuPipeline,
  getWgpuRenderStateRuntime,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Camera3D, ImageResource, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { CustomShaderMaterialKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import {
  customShaderWgpuMeshMaterialRenderer,
  getWgpuCustomMaterialShaderSource,
  registerWgpuCustomShaderMaterial,
  registerWgpuCustomMaterialShader,
} from './customShaderWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

const SOURCE = `
@group(0) @binding(0) var<uniform> frame: vec4f;
@group(1) @binding(0) var<uniform> draw: vec4f;
@group(2) @binding(0) var<uniform> user: vec4f;
@vertex fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return vec4f(position, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return user; }
`;

const NO_LIGHTS: Scene3DLightBlock = {
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

function makeProxy(): Scene3DRenderProxy {
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
    const { fake, state } = makeWgpuScene3DState();
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
    const { fake, state } = makeWgpuScene3DState();
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

  it('reuses the group(3) bind group when the texture bag is unchanged', () => {
    const { fake, state } = makeWgpuScene3DState();
    const material = createCustomShaderMaterial({
      shaderKey: 'test',
      textures: { map: createTexture() },
    });
    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    registerWgpuImageTextureResolver(state);
    customShaderWgpuMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    const firstCount = fake.calls.filter((call) => call.name === 'createBindGroup').length;

    customShaderWgpuMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(firstCount);
  });

  it('rebuilds group(3) for readiness, replacement, sampler, key, and bag-order changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    state.device.createSampler = ((descriptor: GPUSamplerDescriptor) => {
      fake.calls.push({ name: 'createSampler', args: [descriptor] });
      return { descriptor } as unknown as GPUSampler;
    }) as GPUDevice['createSampler'];
    const first = createTexture();
    const second = createTexture();
    const material = createCustomShaderMaterial({
      shaderKey: 'test',
      textures: { first, second },
    });
    registerWgpuCustomMaterialShader(state, 'test', SOURCE);
    registerWgpuImageTextureResolver(state);
    const bindGroupCount = () => fake.calls.filter((call) => call.name === 'createBindGroup').length;
    const bindAndExpectRebuild = (previous: number): number => {
      customShaderWgpuMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
      const next = bindGroupCount();
      expect(next).toBeGreaterThan(previous);
      return next;
    };

    let count = bindAndExpectRebuild(0);
    first.sampler.wrapU = 'repeat';
    count = bindAndExpectRebuild(count);

    if (first.dimension !== '2d') throw new Error('test texture must be 2d');
    first.source = makeImageResource(1);
    count = bindAndExpectRebuild(count);
    first.source = makeImageResource(2);
    count = bindAndExpectRebuild(count);

    material.textures = { renamed: first, second };
    count = bindAndExpectRebuild(count);
    material.textures = { second, renamed: first };
    bindAndExpectRebuild(count);
  });

  it('draws an indexed subset after a valid bind and skips a missing shader', () => {
    const { fake, state } = makeWgpuScene3DState();
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
    const { fake, state } = makeWgpuScene3DState();
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

function makeImageResource(version: number): ImageResource {
  const source = document.createElement('canvas');
  source.width = 1;
  source.height = 1;
  return {
    height: 1,
    kind: ImageTextureSourceKind,
    source,
    version,
    width: 1,
  } as unknown as ImageResource;
}

describe('getWgpuCustomMaterialShaderSource', () => {
  it('returns null for an unknown key', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuCustomMaterialShaderSource(state, 'unknown')).toBeNull();
  });
});

describe('registerWgpuCustomMaterialShader', () => {
  it('registers WGSL by key with last-write-wins lookup', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuCustomMaterialShader(state, 'ripple', SOURCE);
    expect(getWgpuCustomMaterialShaderSource(state, 'ripple')).toBe(SOURCE);
    registerWgpuCustomMaterialShader(state, 'ripple', `${SOURCE}\n// edited`);
    expect(getWgpuCustomMaterialShaderSource(state, 'ripple')).toContain('edited');
    expect(getWgpuCustomMaterialShaderSource(state, 'missing')).toBeNull();
  });

  it('replaces the persistent table while an explicit pipeline state retains its snapshot', () => {
    const { state: screen } = makeWgpuScene3DState();
    const replacement = `${SOURCE}\n// replacement`;
    registerWgpuCustomMaterialShader(screen, 'ripple', SOURCE);
    const snapshot = getWgpuRenderStateRuntime(screen).registries.customMaterialShaders;
    const { state: derived } = makeWgpuScene3DState(createWgpuPipeline(getWgpuRenderStateRuntime(screen).registries));

    getWgpuScene3DRuntime(derived);
    registerWgpuCustomMaterialShader(screen, 'ripple', replacement);

    expect(getWgpuRenderStateRuntime(derived).registries.customMaterialShaders).toBe(snapshot);
    expect(getWgpuRenderStateRuntime(screen).registries.customMaterialShaders).not.toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, 'ripple')).toBe(SOURCE);
    expect(getWgpuCustomMaterialShaderSource(derived, 'ripple')).toBe(SOURCE);
    expect(getWgpuCustomMaterialShaderSource(screen, 'ripple')).toBe(replacement);
  });
});

describe('registerWgpuCustomShaderMaterial', () => {
  it('installs the renderer for CustomShaderMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuCustomShaderMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, CustomShaderMaterialKind)).toBe(customShaderWgpuMeshMaterialRenderer);
  });
});
