import type { WgpuClassicDefineKey, WgpuClassicLightingModel } from '@flighthq/types';

import {
  bindWgpuClassicSurface,
  buildWgpuClassicDefineKey,
  compileWgpuClassicPipeline,
  ensureWgpuClassicPipeline,
  getWgpuClassicModuleSourceForKey,
} from './wgpuClassicPrelude';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function makeKey(lightingModel: WgpuClassicLightingModel): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: false,
    doubleSided: false,
    hasDiffuseMap: false,
    hasNormalMap: false,
    hasSpecularMap: false,
    lightingModel,
  };
}

describe('bindWgpuClassicSurface', () => {
  it('creates a material bind group + buffer once per key and rewrites the uniform each call', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');
    const key = {};
    bindWgpuClassicSurface(state, pipeline, key, [1, 0, 0, 1], [1, 1, 1, 1], 32, 0.5, null, null, null);
    bindWgpuClassicSurface(state, pipeline, key, [0, 1, 0, 1], [1, 1, 1, 1], 64, 0.5, null, null, null);

    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBe(2);
  });
});

describe('buildWgpuClassicDefineKey', () => {
  it('encodes the lighting model first so the three models never collide', () => {
    expect(buildWgpuClassicDefineKey(makeKey('lambert'))[0]).toBe('l');
    expect(buildWgpuClassicDefineKey(makeKey('phong'))[0]).toBe('p');
    expect(buildWgpuClassicDefineKey(makeKey('blinnphong'))[0]).toBe('b');

    const keys = new Set([
      buildWgpuClassicDefineKey(makeKey('lambert')),
      buildWgpuClassicDefineKey(makeKey('phong')),
      buildWgpuClassicDefineKey(makeKey('blinnphong')),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('compileWgpuClassicPipeline', () => {
  it('builds a render pipeline with a material bind-group layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuClassicPipeline(state, makeKey('lambert'), 'bgra8unorm');

    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
  });
});

describe('ensureWgpuClassicPipeline', () => {
  it('caches under the classic: namespace with three distinct entries for the three models', () => {
    const { state } = makeWgpuSceneState();
    ensureWgpuClassicPipeline(state, makeKey('lambert'), 'bgra8unorm');
    ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');
    ensureWgpuClassicPipeline(state, makeKey('blinnphong'), 'bgra8unorm');
    // Re-ensuring an existing model must not add a new cache entry.
    ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');

    const cache = getWgpuSceneRuntime(state).pipelineCache;
    const classicKeys = [...cache.keys()].filter((k) => k.startsWith('classic:'));
    expect(classicKeys.length).toBe(3);
  });
});

describe('getWgpuClassicModuleSourceForKey', () => {
  it('emits the lighting-model const matching the model and folds the others off', () => {
    const phong = getWgpuClassicModuleSourceForKey(makeKey('phong'));
    expect(phong).toContain('const LIGHTING_PHONG : bool = true;');
    expect(phong).toContain('const LIGHTING_BLINNPHONG : bool = false;');

    const blinn = getWgpuClassicModuleSourceForKey(makeKey('blinnphong'));
    expect(blinn).toContain('const LIGHTING_BLINNPHONG : bool = true;');
    expect(blinn).toContain('const LIGHTING_PHONG : bool = false;');

    const lambert = getWgpuClassicModuleSourceForKey(makeKey('lambert'));
    expect(lambert).toContain('const LIGHTING_PHONG : bool = false;');
    expect(lambert).toContain('const LIGHTING_BLINNPHONG : bool = false;');
  });

  it('declares the group(3) shadow bindings and shadow-maps the directional term', () => {
    const source = getWgpuClassicModuleSourceForKey(makeKey('blinnphong'));
    expect(source).toContain('@group(3) @binding(0) var<uniform> shadow : Shadow;');
    expect(source).toContain('@group(3) @binding(1) var shadowMap : texture_depth_2d;');
    expect(source).toContain('@group(3) @binding(2) var shadowSampler : sampler_comparison;');
    // The whole directional contribution is scaled by the PCF factor; ambient stays unshadowed.
    expect(source).toContain('direct * sampleDirectionalShadow(in.worldPosition)');
    expect(source.match(/direct \* sampleDirectionalShadow\(in\.worldPosition\)/g)).toHaveLength(1);
  });
});
