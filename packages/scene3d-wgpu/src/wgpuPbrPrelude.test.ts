import type { WgpuColorAdjustmentMaterialFeature, WgpuPbrDefineKey } from '@flighthq/types/contract';

import {
  buildWgpuPbrDefineKey,
  buildWgpuPbrDefineSource,
  getWgpuPbrModuleBody,
  getWgpuPbrModuleSourceForKey,
} from './wgpuPbrPrelude';
import { makeWgpuSkinningAdapter } from './wgpuScene3DTestHelper';

function key(overrides?: Partial<WgpuPbrDefineKey>): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: false,
    anisotropyEnabled: false,
    clearcoatEnabled: false,
    doubleSided: false,
    hasAlphaMap: false,
    hasBaseColorMap: false,
    hasEmissiveMap: false,
    hasMetallicRoughnessMap: false,
    hasNormalMap: false,
    hasOcclusionMap: false,
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
    ...overrides,
  };
}

const NONE = key();
const STANDARD_ALL = key({
  alphaMaskEnabled: true,
  doubleSided: true,
  hasBaseColorMap: true,
  hasEmissiveMap: true,
  hasMetallicRoughnessMap: true,
  hasNormalMap: true,
  hasOcclusionMap: true,
});
const ALL = key({
  ...STANDARD_ALL,
  anisotropyEnabled: true,
  clearcoatEnabled: true,
  iridescenceEnabled: true,
  sheenEnabled: true,
  specularEnabled: true,
  subsurfaceEnabled: true,
  transmissionEnabled: true,
});
const COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }',
  matrixFragmentShaderChunk:
    'fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }',
  record: () => {},
  resolveFlush: () => null,
};

describe('buildWgpuPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildWgpuPbrDefineKey(NONE)).toBe('--------:-------');
    expect(buildWgpuPbrDefineKey(STANDARD_ALL)).toBe('mdbnroe-:-------');
    expect(buildWgpuPbrDefineKey(ALL)).toBe('mdbnroe-:CSAIPUT');
    expect(buildWgpuPbrDefineKey(key({ alphaMaskEnabled: true }))).toBe('m-------:-------');
    expect(buildWgpuPbrDefineKey(key({ doubleSided: true }))).toBe('-d------:-------');
    expect(buildWgpuPbrDefineKey(key({ hasBaseColorMap: true }))).toBe('--b-----:-------');
    expect(buildWgpuPbrDefineKey(key({ hasNormalMap: true }))).toBe('---n----:-------');
    expect(buildWgpuPbrDefineKey(key({ hasMetallicRoughnessMap: true }))).toBe('----r---:-------');
    expect(buildWgpuPbrDefineKey(key({ hasOcclusionMap: true }))).toBe('-----o--:-------');
    expect(buildWgpuPbrDefineKey(key({ hasEmissiveMap: true }))).toBe('------e-:-------');
    expect(buildWgpuPbrDefineKey(key({ hasAlphaMap: true }))).toBe('-------a:-------');
    expect(buildWgpuPbrDefineKey(key({ clearcoatEnabled: true }))).toBe('--------:C------');
    expect(buildWgpuPbrDefineKey(key({ transmissionEnabled: true }))).toBe('--------:------T');
  });

  it('is identical for identical flags (cache soundness)', () => {
    expect(buildWgpuPbrDefineKey(key(ALL))).toBe(buildWgpuPbrDefineKey(key(ALL)));
  });

  it('keeps the base key stable and appends color adjustment only for promotion', () => {
    expect(buildWgpuPbrDefineKey(key({ hasColorAdjustment: true }))).toBe(`${buildWgpuPbrDefineKey(NONE)}c`);
  });
});

describe('buildWgpuPbrDefineSource', () => {
  it('emits a const bool flag block reflecting the key', () => {
    const source = buildWgpuPbrDefineSource(key({ hasBaseColorMap: true, doubleSided: true }));
    expect(source).toContain('const HAS_BASE_COLOR_MAP : bool = true;');
    expect(source).toContain('const DOUBLE_SIDED : bool = true;');
    expect(source).toContain('const ALPHA_MASK : bool = false;');
    expect(source).toContain('const HAS_NORMAL_MAP : bool = false;');
  });

  it('emits a const for every extension lobe', () => {
    const all = buildWgpuPbrDefineSource(ALL);
    expect(all).toContain('const CLEARCOAT : bool = true;');
    expect(all).toContain('const SHEEN : bool = true;');
    expect(all).toContain('const ANISOTROPY : bool = true;');
    expect(all).toContain('const IRIDESCENCE : bool = true;');
    expect(all).toContain('const SPECULAR_EXT : bool = true;');
    expect(all).toContain('const SUBSURFACE : bool = true;');
    expect(all).toContain('const TRANSMISSION : bool = true;');

    const none = buildWgpuPbrDefineSource(NONE);
    expect(none).toContain('const CLEARCOAT : bool = false;');
    expect(none).toContain('const TRANSMISSION : bool = false;');
    expect(none).toContain('const HAS_ALPHA_MAP : bool = false;');
  });

  it('gates the alpha-map const off the dedicated coverage-map flag', () => {
    expect(buildWgpuPbrDefineSource(key({ hasAlphaMap: true }))).toContain('const HAS_ALPHA_MAP : bool = true;');
  });
});

describe('getWgpuPbrModuleBody', () => {
  it('declares the entry points and bind-group structs', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('fn vs_main');
    expect(body).toContain('fn fs_main');
    expect(body).toContain('struct Frame');
    expect(body).toContain('struct MaterialBlock');
    expect(body).toContain('var<uniform> frame');
  });

  it('samples every standard map through its own sampler binding', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('textureSample(baseColorTexture, baseColorSampler, in.uv)');
    expect(body).toContain('textureSample(metallicRoughnessTexture, metallicRoughnessSampler, in.uv)');
    expect(body).toContain('textureSample(normalTexture, normalSampler, in.uv)');
    expect(body).toContain('textureSample(occlusionTexture, occlusionSampler, in.uv)');
    expect(body).toContain('textureSample(emissiveTexture, emissiveSampler, in.uv)');
    expect(body).toContain('textureSample(alphaTexture, alphaSampler, in.uv)');
  });

  it('includes the extension lobe helpers behind their const flags', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('distributionGgxAnisotropic');
    expect(body).toContain('distributionCharlie');
    expect(body).toContain('iridescentFresnel');
    expect(body).toContain('if (CLEARCOAT)');
    expect(body).toContain('if (TRANSMISSION)');
  });

  // Image-based-lighting shares group(3) with shadow so PBR stays within WebGPU's required
  // maxBindGroups minimum of 4.
  it('declares the group(3) IBL bindings and applies the split-sum ambient term', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('@group(3) @binding(3) var<uniform> ibl');
    expect(body).toContain('var iblIrradiance : texture_cube<f32>');
    expect(body).toContain('var iblPrefiltered : texture_cube<f32>');
    expect(body).toContain('var iblBrdf : texture_2d<f32>');
    expect(body).toContain('fn sampleIblAmbient');
    expect(body).toContain('fresnelSchlickRoughness');
    // split-sum specular = prefiltered * (F * brdf.x + brdf.y)
    expect(body).toContain('prefiltered * (F * brdf.x + brdf.y)');
    // gated ambient: IBL when enabled, else the flat ambient term.
    expect(body).toContain('if (ibl.params.x > 0.5)');
  });
});

describe('getWgpuPbrModuleSourceForKey', () => {
  it('splices the registered post-shade chunk only into the promoted variant', () => {
    const base = getWgpuPbrModuleSourceForKey(NONE, false, null, COLOR_FEATURE);
    const adjusted = getWgpuPbrModuleSourceForKey(key({ hasColorAdjustment: true }), false, null, COLOR_FEATURE);
    expect(base).not.toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('draw.flightColorScale');
  });

  it('splices the full-matrix post-shade chunk into its own variant', () => {
    const matrix = getWgpuPbrModuleSourceForKey(key({ hasColorMatrix: true }), false, null, COLOR_FEATURE);
    expect(matrix).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(matrix).toContain('draw.flightColorMatrix0');
  });

  it('prepends the flag block to the module body', () => {
    const k = key({ hasNormalMap: true });
    const source = getWgpuPbrModuleSourceForKey(k);
    expect(source.startsWith(buildWgpuPbrDefineSource(k))).toBe(true);
    expect(source).toContain('fn fs_main');
    expect(source).toContain('@interpolate(flat) objectAlpha : f32');
    expect(source).toContain('flightMeshCoverage(alpha, in.objectAlpha, draw.params.y)');
    expect(source).not.toContain('jointTexture');
    expect(getWgpuPbrModuleSourceForKey(k, true, makeWgpuSkinningAdapter())).toContain('textureLoad(jointTexture');
  });
});
