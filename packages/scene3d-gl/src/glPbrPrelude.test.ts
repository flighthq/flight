import type { GlColorAdjustmentMaterialFeature, GlPbrDefineKey } from '@flighthq/types/contract';

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
    hasAlphaMap: false,
    hasBaseColorMap: false,
    hasEmissiveMap: false,
    hasMetallicRoughnessMap: false,
    hasNormalMap: false,
    hasOcclusionMap: false,
    hasUvTransform: false,
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
const ALL = makeKey(STANDARD_ALL);
const COLOR_FEATURE: GlColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }',
  matrixFragmentShaderChunk:
    'vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }',
  drawShapeMeshes: () => {},
  flush: () => false,
  record: () => {},
};

describe('buildGlPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildGlPbrDefineKey(NONE)).toBe('--------:-');
    expect(buildGlPbrDefineKey(STANDARD_ALL)).toBe('mbnroe--:-');
    expect(buildGlPbrDefineKey(ALL)).toBe('mbnroe--:-');
    expect(buildGlPbrDefineKey(makeKey({ hasBaseColorMap: true }))).toBe('-b------:-');
    expect(buildGlPbrDefineKey(makeKey({ hasAlphaMap: true }))).toBe('------a-:-');
  });

  it('encodes the HAS_UV_TRANSFORM variant as a distinct standard-block slot', () => {
    expect(buildGlPbrDefineKey(makeKey({ hasUvTransform: true }))).toBe('-------u:-');
    expect(buildGlPbrDefineKey(makeKey({ hasUvTransform: true }))).not.toBe(buildGlPbrDefineKey(NONE));
  });

  it('encodes the HAS_SKIN variant as a distinct trailing slot', () => {
    expect(buildGlPbrDefineKey(makeKey({ hasSkin: true }))).toBe('--------:k');
    expect(buildGlPbrDefineKey(makeKey({ hasSkin: true }))).not.toBe(buildGlPbrDefineKey(NONE));
  });

  it('appends color adjustment only for the promoted variant', () => {
    expect(buildGlPbrDefineKey(NONE)).toBe('--------:-');
    expect(buildGlPbrDefineKey(makeKey({ hasColorAdjustment: true }))).toBe('--------:-c');
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
    expect(all).not.toContain('CLEARCOAT');
    expect(all).not.toContain('ANISOTROPY');

    const none = buildGlPbrDefineSource(NONE);
    expect(none).not.toContain('#define ALPHA_MASK');
    expect(none).not.toContain('#define HAS_BASE_COLOR_MAP');
    expect(none).not.toContain('#define HAS_ALPHA_MAP');
  });

  it('gates the HAS_ALPHA_MAP define off the dedicated coverage-map flag', () => {
    expect(buildGlPbrDefineSource(makeKey({ hasAlphaMap: true }))).toContain('#define HAS_ALPHA_MAP');
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
  it('splices the registered post-shade chunk only into the promoted variant', () => {
    const base = getGlPbrFragmentSourceForKey(NONE, [], COLOR_FEATURE);
    const adjusted = getGlPbrFragmentSourceForKey(makeKey({ hasColorAdjustment: true }), [], COLOR_FEATURE);
    expect(base).not.toContain('vec4 applyFlightColorAdjustment');
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('fragColor = applyFlightColorAdjustment');
  });

  it('splices the full-matrix post-shade chunk into its own variant', () => {
    const matrix = getGlPbrFragmentSourceForKey(makeKey({ hasColorMatrix: true }), [], COLOR_FEATURE);
    expect(matrix).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(matrix).toContain('fragColor = applyFlightColorMatrix');
  });

  it('prepends the define block to the fragment body', () => {
    const src = getGlPbrFragmentSourceForKey(STANDARD_ALL);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('#define HAS_NORMAL_MAP');
    expect(src).toContain('out vec4 fragColor');
    expect(src.match(/float sampleDirectionalShadow\(vec3 worldPos, vec3 geometricNormal\)/g)).toHaveLength(1);
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

  it('declares contributed helpers before the IBL function that calls them', () => {
    const src = getGlPbrFragmentSourceForKey(NONE, [
      {
        applySurface: '',
        contributeIbl: '  ambient += flightExtensionSample();',
        contributePunctual: '',
        finalize: '',
        fragmentDeclarations: '',
        fragmentFunctions: 'vec3 flightExtensionSample() { return vec3(0.0); }',
        key: 'ordering',
        textureCount: 0,
      },
    ]);

    expect(src.indexOf('vec3 flightExtensionSample()')).toBeLessThan(src.indexOf('vec3 sampleIblAmbient('));
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
  it('injects the skin declarations and HAS_SKIN define only for the skinned variant', () => {
    const rigid = getGlPbrVertexSourceForKey(NONE);
    expect(rigid).not.toContain('#define HAS_SKIN');
    expect(rigid).not.toContain('a_joints0');
    expect(rigid).not.toContain('mat4 skinMatrix()');

    const skinned = getGlPbrVertexSourceForKey(makeKey({ hasSkin: true }));
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).not.toContain('#define MAX_JOINTS');
    expect(skinned).toContain('sampler2D u_jointTexture');
    expect(skinned).toContain('texelFetch');
    expect(skinned).toContain('mat4 skinMatrix()');
    expect(skinned).toContain('a_joints0');
  });

  it('prepends the define block to the vertex body', () => {
    const src = getGlPbrVertexSourceForKey(NONE);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('gl_Position');
  });
});

describe('tangent frame under a model transform', () => {
  it('carries the tangent through the model matrix and the mirror through its handedness', () => {
    // See glShadedPrelude's copy of this test: a tangent is a true surface vector and follows the
    // model matrix, a normal is a covector and follows the inverse-transpose, and tangent.w is
    // handedness that a mirroring transform reverses. All four preludes shared one wrong matrix.
    const vertex = getGlPbrVertexSource();
    expect(vertex).toContain('mat3 modelRotation = mat3(u_model);');
    expect(vertex).toContain('determinant(modelRotation) < 0.0 ? -1.0 : 1.0');
    expect(vertex).toContain('v_tangent = vec4(modelRotation * localTangent, tangentHandedness);');
    expect(vertex).toContain('v_normal = u_normalMatrix * localNormal;');
    expect(vertex).not.toContain('u_normalMatrix * localTangent');
  });
});
