import {
  buildGlPbrDefineKey,
  buildGlPbrDefineSource,
  getGlPbrFragmentSource,
  getGlPbrFragmentSourceForKey,
  getGlPbrVertexSource,
  getGlPbrVertexSourceForKey,
} from './glPbrPrelude';

const NONE = { alphaMaskEnabled: false, hasBaseColorMap: false, hasNormalMap: false };
const ALL = { alphaMaskEnabled: true, hasBaseColorMap: true, hasNormalMap: true };

describe('buildGlPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildGlPbrDefineKey(NONE)).toBe('---');
    expect(buildGlPbrDefineKey(ALL)).toBe('mbn');
    expect(buildGlPbrDefineKey({ alphaMaskEnabled: false, hasBaseColorMap: true, hasNormalMap: false })).toBe('-b-');
  });

  it('is identical for equal flag sets', () => {
    expect(buildGlPbrDefineKey({ ...ALL })).toBe(buildGlPbrDefineKey({ ...ALL }));
  });
});

describe('buildGlPbrDefineSource', () => {
  it('opens with the GLSL 300 es version directive', () => {
    expect(buildGlPbrDefineSource(NONE).startsWith('#version 300 es')).toBe(true);
  });

  it('emits a define for each enabled flag and none for disabled flags', () => {
    const all = buildGlPbrDefineSource(ALL);
    expect(all).toContain('#define ALPHA_MASK');
    expect(all).toContain('#define HAS_BASE_COLOR_MAP');
    expect(all).toContain('#define HAS_NORMAL_MAP');

    const none = buildGlPbrDefineSource(NONE);
    expect(none).not.toContain('#define ALPHA_MASK');
    expect(none).not.toContain('#define HAS_BASE_COLOR_MAP');
    expect(none).not.toContain('#define HAS_NORMAL_MAP');
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
    const src = getGlPbrFragmentSourceForKey(ALL);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('#define HAS_NORMAL_MAP');
    expect(src).toContain('out vec4 fragColor');
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
