import type { GlPbrDefineKey } from './glPbrPrelude';
import {
  buildGlPbrDefineKey,
  buildGlPbrDefineSource,
  getGlPbrFragmentSource,
  getGlPbrFragmentSourceForKey,
  getGlPbrVertexSource,
  getGlPbrVertexSourceForKey,
} from './glPbrPrelude';

function makeKey(overrides?: Partial<GlPbrDefineKey>): GlPbrDefineKey {
  return {
    alphaMaskEnabled: false,
    anisotropyEnabled: false,
    clearcoatEnabled: false,
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

const NONE = makeKey();
const STANDARD_ALL = makeKey({
  alphaMaskEnabled: true,
  hasBaseColorMap: true,
  hasEmissiveMap: true,
  hasMetallicRoughnessMap: true,
  hasNormalMap: true,
  hasOcclusionMap: true,
});
const ALL = makeKey({
  ...STANDARD_ALL,
  anisotropyEnabled: true,
  clearcoatEnabled: true,
  iridescenceEnabled: true,
  sheenEnabled: true,
  specularEnabled: true,
  subsurfaceEnabled: true,
  transmissionEnabled: true,
});

describe('buildGlPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildGlPbrDefineKey(NONE)).toBe('------:-------');
    expect(buildGlPbrDefineKey(STANDARD_ALL)).toBe('mbnroe:-------');
    expect(buildGlPbrDefineKey(ALL)).toBe('mbnroe:CSAIPUT');
    expect(buildGlPbrDefineKey(makeKey({ hasBaseColorMap: true }))).toBe('-b----:-------');
    expect(buildGlPbrDefineKey(makeKey({ clearcoatEnabled: true }))).toBe('------:C------');
  });

  it('is identical for equal flag sets', () => {
    expect(buildGlPbrDefineKey(makeKey(ALL))).toBe(buildGlPbrDefineKey(makeKey(ALL)));
  });
});

describe('buildGlPbrDefineSource', () => {
  it('emits a define for each enabled flag and none for disabled flags', () => {
    const all = buildGlPbrDefineSource(ALL);
    expect(all).toContain('#define ALPHA_MASK');
    expect(all).toContain('#define HAS_BASE_COLOR_MAP');
    expect(all).toContain('#define HAS_NORMAL_MAP');
    expect(all).toContain('#define HAS_METALLIC_ROUGHNESS_MAP');
    expect(all).toContain('#define HAS_OCCLUSION_MAP');
    expect(all).toContain('#define HAS_EMISSIVE_MAP');
    expect(all).toContain('#define CLEARCOAT');
    expect(all).toContain('#define SHEEN');
    expect(all).toContain('#define ANISOTROPY');
    expect(all).toContain('#define IRIDESCENCE');
    expect(all).toContain('#define SPECULAR_EXT');
    expect(all).toContain('#define SUBSURFACE');
    expect(all).toContain('#define TRANSMISSION');

    const none = buildGlPbrDefineSource(NONE);
    expect(none).not.toContain('#define ALPHA_MASK');
    expect(none).not.toContain('#define HAS_BASE_COLOR_MAP');
    expect(none).not.toContain('#define CLEARCOAT');
  });

  it('opens with the GLSL 300 es version directive', () => {
    expect(buildGlPbrDefineSource(NONE).startsWith('#version 300 es')).toBe(true);
  });
});

describe('getGlPbrFragmentSource', () => {
  it('declares the PBR fragment interface and outputs linear HDR radiance', () => {
    const src = getGlPbrFragmentSource();
    expect(src).toContain('out vec4 fragColor');
    expect(src).toContain('distributionGgx');
    expect(src).toContain('fresnelSchlick');
    expect(src).toContain('u_directionalRadiance');
  });

  it('does not embed a version directive (that comes from the define block)', () => {
    expect(getGlPbrFragmentSource()).not.toContain('#version');
  });
});

describe('getGlPbrFragmentSourceForKey', () => {
  it('prepends the define block to the fragment body', () => {
    const src = getGlPbrFragmentSourceForKey(STANDARD_ALL);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('#define HAS_NORMAL_MAP');
    expect(src).toContain('out vec4 fragColor');
  });

  it('emits the MAX_FORWARD_LIGHTS spec constant and loops the punctual light arrays', () => {
    const src = getGlPbrFragmentSourceForKey(NONE);
    expect(src).toContain('#define MAX_FORWARD_LIGHTS');
    expect(src).toContain('u_pointLights');
    expect(src).toContain('u_spotLights');
    expect(src).toContain('u_hemisphereLights');
    // Directional, point, and spot lights share the one Cook-Torrance BRDF (no forked shading model).
    expect(src).toContain('shadePbrPunctual');
  });
});

describe('getGlPbrVertexSource', () => {
  it('declares the canonical PBR vertex attributes and model/view-projection uniforms', () => {
    const src = getGlPbrVertexSource();
    expect(src).toContain('layout(location = 0) in vec3 a_position');
    expect(src).toContain('layout(location = 1) in vec3 a_normal');
    expect(src).toContain('layout(location = 2) in vec4 a_tangent');
    expect(src).toContain('layout(location = 3) in vec2 a_uv0');
    expect(src).toContain('u_viewProjection');
    expect(src).toContain('u_model');
    expect(src).toContain('u_normalMatrix');
  });
});

describe('getGlPbrVertexSourceForKey', () => {
  it('prepends the define block to the vertex body', () => {
    const src = getGlPbrVertexSourceForKey(NONE);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('gl_Position');
  });
});
