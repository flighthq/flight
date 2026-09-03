import { createTexture } from '@flighthq/texture/contract';
import type {
  ImageResource,
  WgpuClassicDefineKey,
  WgpuClassicLightingModel,
  WgpuColorAdjustmentMaterialFeature,
} from '@flighthq/types/contract';

import {
  bindWgpuClassicSurface,
  buildWgpuClassicDefineKey,
  compileWgpuClassicPipeline,
  ensureWgpuClassicPipeline,
  getWgpuClassicModuleSourceForKey,
  getWgpuClassicSharedSamplerModuleSourceForKey,
} from './wgpuClassicPrelude';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState, makeWgpuSkinningAdapter } from './wgpuScene3DTestHelper';

function makeKey(lightingModel: WgpuClassicLightingModel): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: false,
    doubleSided: false,
    hasAlphaMap: false,
    hasDiffuseMap: false,
    hasNormalMap: false,
    hasSpecularMap: false,
    lightingModel,
  };
}
const COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }',
  matrixFragmentShaderChunk:
    'fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }',
  record: () => {},
  resolveFlush: () => null,
};

describe('bindWgpuClassicSurface', () => {
  it('creates a material bind group + buffer once per key and rewrites the uniform each call', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');
    const key = {};
    bindWgpuClassicSurface(state, pipeline, key, [1, 0, 0, 1], [1, 1, 1, 1], 32, 0.5, null, null, null, null);
    bindWgpuClassicSurface(state, pipeline, key, [0, 1, 0, 1], [1, 1, 1, 1], 64, 0.5, null, null, null, null);

    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(1);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBe(2);
  });

  // The per-map rebuild conditions (swap / unready→ready / ready→ready / version bump / sampler change)
  // are proven directly against isWgpuMaterialBindGroupRebuildNeeded in wgpuMeshPipeline.test.ts; the binder
  // wires that predicate around buildWgpuMaterialBindGroup. The unchanged-binds-no-rebuild case is the
  // "creates a material bind group … once per key" test above.

  it('exercises the real sampler path with a non-null primary texture and builds nothing new in steady state', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');
    const key = {};
    // A ready diffuse (primary) map so bind() actually runs getWgpuMaterialSampler → getWgpuSampler (the
    // path an already-resolved-sampler helper test bypasses). Same shared binder that PBR uses.
    const diffuseMap = createTexture({
      dimension: '2d',
      source: { source: {} } as unknown as ImageResource,
    });
    bindWgpuClassicSurface(state, pipeline, key, [1, 0, 0, 1], [1, 1, 1, 1], 32, 0.5, diffuseMap, null, null, null);
    const count = (name: string) => fake.calls.filter((c) => c.name === name).length;
    const [samplers, bindGroups, buffers] = [count('createSampler'), count('createBindGroup'), count('createBuffer')];
    expect(samplers).toBeGreaterThanOrEqual(1); // the primary sampler was built once on first bind

    // Re-bind the unchanged textured material: the sampler + view resolution run again (getWgpuSampler
    // cache hit via its packed-number key), but no new GPUSampler / bind group / buffer is constructed —
    // steady state builds nothing beyond the per-bind uniform write.
    bindWgpuClassicSurface(state, pipeline, key, [1, 0, 0, 1], [1, 1, 1, 1], 32, 0.5, diffuseMap, null, null, null);
    bindWgpuClassicSurface(state, pipeline, key, [1, 0, 0, 1], [1, 1, 1, 1], 32, 0.5, diffuseMap, null, null, null);
    expect(count('createSampler')).toBe(samplers);
    expect(count('createBindGroup')).toBe(bindGroups);
    expect(count('createBuffer')).toBe(buffers);
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

  it('encodes the alpha map as a distinct variant', () => {
    const withAlpha = { ...makeKey('blinnphong'), hasAlphaMap: true };
    expect(buildWgpuClassicDefineKey(withAlpha)).not.toBe(buildWgpuClassicDefineKey(makeKey('blinnphong')));
  });

  it('keeps the base key stable and appends color adjustment only for promotion', () => {
    const base = makeKey('phong');
    expect(buildWgpuClassicDefineKey({ ...base, hasColorAdjustment: true })).toBe(
      `${buildWgpuClassicDefineKey(base)}c`,
    );
  });
});

describe('compileWgpuClassicPipeline', () => {
  it('builds a render pipeline with a material bind-group layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = compileWgpuClassicPipeline(state, makeKey('lambert'), 'bgra8unorm');

    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
  });
});

describe('ensureWgpuClassicPipeline', () => {
  it('caches under the classic: namespace with three distinct entries for the three models', () => {
    const { state } = makeWgpuScene3DState();
    ensureWgpuClassicPipeline(state, makeKey('lambert'), 'bgra8unorm');
    ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');
    ensureWgpuClassicPipeline(state, makeKey('blinnphong'), 'bgra8unorm');
    // Re-ensuring an existing model must not add a new cache entry.
    ensureWgpuClassicPipeline(state, makeKey('phong'), 'bgra8unorm');

    const cache = getWgpuScene3DRuntime(state).pipelineCache;
    const classicKeys = [...cache.keys()].filter((k) => k.startsWith('classic:'));
    expect(classicKeys.length).toBe(3);
  });
});

describe('getWgpuClassicModuleSourceForKey', () => {
  it('splices the registered post-shade chunk only into the promoted variant', () => {
    const base = getWgpuClassicModuleSourceForKey(makeKey('phong'), false, null, COLOR_FEATURE);
    const adjusted = getWgpuClassicModuleSourceForKey(
      { ...makeKey('phong'), hasColorAdjustment: true },
      false,
      null,
      COLOR_FEATURE,
    );
    expect(base).not.toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('draw.flightColorScale');
  });

  it('selects a distinct full-matrix post-shade variant', () => {
    const matrix = getWgpuClassicModuleSourceForKey(
      { ...makeKey('phong'), hasColorMatrix: true },
      false,
      null,
      COLOR_FEATURE,
    );
    expect(buildWgpuClassicDefineKey({ ...makeKey('phong'), hasColorMatrix: true })).toBe(
      `${buildWgpuClassicDefineKey(makeKey('phong'))}x`,
    );
    expect(matrix).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(matrix).toContain('draw.flightColorMatrix0');
    expect(matrix).not.toContain(COLOR_FEATURE.fragmentShaderChunk);
  });

  it('gates the alpha-map const + coverage multiply off the alpha-map flag', () => {
    const none = getWgpuClassicModuleSourceForKey(makeKey('blinnphong'));
    expect(none).toContain('const HAS_ALPHA_MAP : bool = false;');
    const withAlpha = getWgpuClassicModuleSourceForKey({ ...makeKey('blinnphong'), hasAlphaMap: true });
    expect(withAlpha).toContain('const HAS_ALPHA_MAP : bool = true;');
    expect(withAlpha).toContain('alphaTexture');
    expect(withAlpha).toContain('textureSample(alphaTexture, alphaSampler, in.uv).g');
  });

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

  it('emits the palette and skin attributes only for the HAS_SKIN variant', () => {
    expect(getWgpuClassicModuleSourceForKey(makeKey('blinnphong'))).not.toContain('jointTexture');
    expect(getWgpuClassicModuleSourceForKey(makeKey('blinnphong'), true, makeWgpuSkinningAdapter())).toContain(
      '@group(1) @binding(1) var jointTexture',
    );
  });

  it('declares the group(3) shadow bindings and shadow-maps the directional term', () => {
    const source = getWgpuClassicModuleSourceForKey(makeKey('blinnphong'));
    expect(source).toContain('@group(3) @binding(0) var<uniform> shadow : Shadow;');
    expect(source).toContain('@group(3) @binding(1) var shadowMap : texture_depth_2d;');
    expect(source).toContain('@group(3) @binding(2) var shadowSampler : sampler_comparison;');
    expect(source.match(/fn sampleDirectionalShadow\(worldPos : vec3f, geometricNormal : vec3f\)/g)).toHaveLength(1);
    // The whole directional contribution is scaled by the PCF factor; ambient stays unshadowed.
    expect(source).toContain('direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)');
    expect(source.match(/direct \* sampleDirectionalShadow\(in\.worldPosition, geometricNormal\)/g)).toHaveLength(1);
  });

  it('consumes every packed punctual-light family through the shared classic BRDF', () => {
    const source = getWgpuClassicModuleSourceForKey(makeKey('blinnphong'));
    expect(source).toContain('let pointCount = u32(frame.punctualCounts.x);');
    expect(source).toContain('frame.pointLights[point * 2u + 1u].xyz * atten');
    expect(source).toContain('let spotCount = u32(frame.punctualCounts.y);');
    expect(source).toContain('frame.spotLights[spot * 4u + 1u].xyz * atten * cone');
    expect(source).toContain('let hemisphereCount = u32(frame.punctualCounts.z);');
    expect(source).toContain('frame.hemisphereLights[hemisphere * 3u + 1u].xyz');
    expect(source.match(/shadeClassicLight\(/g)).toHaveLength(4);
  });
});

describe('getWgpuClassicSharedSamplerModuleSourceForKey', () => {
  it('retains the legacy shared-sampler binding contract for shaded composition', () => {
    const source = getWgpuClassicSharedSamplerModuleSourceForKey(makeKey('blinnphong'));
    expect(source).toContain('@group(2) @binding(1) var materialSampler : sampler;');
    expect(source).toContain('@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;');
    expect(source).toContain('@group(2) @binding(5) var alphaTexture : texture_2d<f32>;');
    expect(source).toContain('textureSample(normalTexture, materialSampler, in.uv)');
    expect(source).not.toContain('diffuseSampler');
  });
});
