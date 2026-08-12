import type { GlClassicDefineKey, GlColorAdjustmentMaterialFeature } from '@flighthq/types/contract';

import {
  buildGlClassicDefineKey,
  compileGlClassicProgram,
  ensureGlClassicProgram,
  getGlClassicFragmentSource,
  getGlClassicFragmentSourceForKey,
  getGlClassicVertexSource,
  getGlClassicVertexSourceForKey,
} from './glClassicPrelude';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

const LAMBERT: GlClassicDefineKey = {
  alphaMaskEnabled: false,
  hasAlphaMap: false,
  hasDiffuseMap: false,
  hasNormalMap: false,
  hasSpecularMap: false,
  hasUvTransform: false,
  lightingModel: 'lambert',
};
const PHONG: GlClassicDefineKey = { ...LAMBERT, lightingModel: 'phong' };
const BLINNPHONG: GlClassicDefineKey = { ...LAMBERT, lightingModel: 'blinnphong' };
const COLOR_FEATURE: GlColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }',
  matrixFragmentShaderChunk:
    'vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }',
  drawShapeMeshes: () => {},
  flush: () => false,
  record: () => {},
};

describe('buildGlClassicDefineKey', () => {
  it('encodes the lighting model first, then the feature flags', () => {
    expect(buildGlClassicDefineKey(LAMBERT)).toBe('l-------');
    expect(buildGlClassicDefineKey(PHONG)).toBe('p-------');
    expect(buildGlClassicDefineKey(BLINNPHONG)).toBe('b-------');
    expect(
      buildGlClassicDefineKey({
        alphaMaskEnabled: true,
        hasAlphaMap: true,
        hasDiffuseMap: true,
        hasNormalMap: true,
        hasSpecularMap: true,
        hasUvTransform: true,
        lightingModel: 'phong',
      }),
    ).toBe('pmdsnau-');
  });

  it('encodes a non-identity uv transform in the u slot ahead of skin', () => {
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasUvTransform: true })).toBe('l-----u-');
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasUvTransform: true })).not.toBe(buildGlClassicDefineKey(LAMBERT));
  });

  it('sets the trailing skin flag so a skinned variant keys distinctly', () => {
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasSkin: true })).toBe('l------k');
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasSkin: true })).not.toBe(buildGlClassicDefineKey(LAMBERT));
  });

  it('keeps the base identity stable and appends a promoted color-adjustment marker', () => {
    expect(buildGlClassicDefineKey(LAMBERT)).toBe('l-------');
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasColorAdjustment: true })).toBe('l-------c');
  });

  it('produces distinct strings per lighting model so they never collide', () => {
    const keys = new Set([
      buildGlClassicDefineKey(LAMBERT),
      buildGlClassicDefineKey(PHONG),
      buildGlClassicDefineKey(BLINNPHONG),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('compileGlClassicProgram', () => {
  it('compiles, links, and resolves the classic + lit uniform locations', () => {
    const gl = makeFakeGl2();
    const program = compileGlClassicProgram(gl, PHONG);
    expect(program.locDiffuse).not.toBeNull();
    expect(program.locSpecular).not.toBeNull();
    expect(program.locShininess).not.toBeNull();
    expect(program.locNormalMap).not.toBeNull();
    expect(program.locNormalScale).not.toBeNull();
    expect(program.locAlphaCutoff).not.toBeNull();
    // Spread from resolveGlLitLocations.
    expect(program.locDirectional).not.toBeNull();
    expect(program.locCameraPosition).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlClassicProgram', () => {
  it('caches a variant under the classic namespace and reuses it', () => {
    const { state, gl } = makeGlScene3DState();
    const first = ensureGlClassicProgram(state, LAMBERT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlClassicProgram(state, LAMBERT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlScene3DRuntime(state).programCache.keys()].some((k) => k.startsWith('classic:'))).toBe(true);
  });

  it('caches a distinct entry per lighting model', () => {
    const { state } = makeGlScene3DState();
    const lambert = ensureGlClassicProgram(state, LAMBERT);
    const phong = ensureGlClassicProgram(state, PHONG);
    const blinnPhong = ensureGlClassicProgram(state, BLINNPHONG);
    expect(lambert).not.toBe(phong);
    expect(phong).not.toBe(blinnPhong);
    expect(lambert).not.toBe(blinnPhong);
    expect(getGlScene3DRuntime(state).programCache.size).toBe(3);
  });

  it('folds the render-state skinned-run flag into a distinct HAS_SKIN variant', () => {
    const { state } = makeGlScene3DState();
    const rigid = ensureGlClassicProgram(state, LAMBERT);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlClassicProgram(state, LAMBERT);

    expect(skinned).not.toBe(rigid);
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toContain('classic:l------k');
    expect(skinned.locJointTexture).not.toBeNull();
  });
});

describe('getGlClassicFragmentSource', () => {
  it('returns the fragment body without a version/define block', () => {
    const source = getGlClassicFragmentSource();
    expect(source).toContain('fragColor');
    expect(source).not.toContain('#version 300 es');
  });
});

describe('getGlClassicFragmentSourceForKey', () => {
  it('splices the registered post-shade chunk only into the presence-selected variant', () => {
    const base = getGlClassicFragmentSourceForKey(LAMBERT, COLOR_FEATURE);
    const adjusted = getGlClassicFragmentSourceForKey({ ...LAMBERT, hasColorAdjustment: true }, COLOR_FEATURE);
    expect(base).not.toContain('vec4 applyFlightColorAdjustment');
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('fragColor = applyFlightColorAdjustment');
  });

  it('selects a distinct full-matrix post-shade variant', () => {
    const matrix = getGlClassicFragmentSourceForKey({ ...LAMBERT, hasColorMatrix: true }, COLOR_FEATURE);
    expect(buildGlClassicDefineKey({ ...LAMBERT, hasColorMatrix: true })).toBe(`${buildGlClassicDefineKey(LAMBERT)}x`);
    expect(matrix).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(matrix).toContain('fragColor = applyFlightColorMatrix');
    expect(matrix).not.toContain(COLOR_FEATURE.fragmentShaderChunk);
  });

  it('includes the lighting-model and feature defines only when set', () => {
    expect(getGlClassicFragmentSourceForKey(LAMBERT)).not.toContain('#define LIGHTING_PHONG');
    expect(getGlClassicFragmentSourceForKey(LAMBERT)).not.toContain('#define LIGHTING_BLINNPHONG');
    expect(getGlClassicFragmentSourceForKey(PHONG)).toContain('#define LIGHTING_PHONG');
    expect(getGlClassicFragmentSourceForKey(BLINNPHONG)).toContain('#define LIGHTING_BLINNPHONG');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasDiffuseMap: true })).toContain('#define HAS_DIFFUSE_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasSpecularMap: true })).toContain('#define HAS_SPECULAR_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasNormalMap: true })).toContain('#define HAS_NORMAL_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasAlphaMap: true })).toContain('#define HAS_ALPHA_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });

  it('gates the alpha-map define off the key and always carries the guarded sampler + coverage multiply', () => {
    // The define is what varies by key; the #ifdef-guarded sampler and multiply are unconditional raw
    // text (same as the normal/specular maps), compiled out unless HAS_ALPHA_MAP is defined.
    expect(getGlClassicFragmentSourceForKey(BLINNPHONG)).not.toContain('#define HAS_ALPHA_MAP');
    const withAlpha = getGlClassicFragmentSourceForKey({ ...BLINNPHONG, hasAlphaMap: true });
    expect(withAlpha).toContain('#define HAS_ALPHA_MAP');
    expect(withAlpha).toContain('uniform sampler2D u_alphaMap;');
    expect(withAlpha).toContain('diffuse.a *= texture(u_alphaMap, v_uv0).g;');
  });

  it('includes the standard light block uniforms', () => {
    const source = getGlClassicFragmentSourceForKey(LAMBERT);
    expect(source).toContain('u_directionalRadiance');
    expect(source).toContain('u_ambientRadiance');
    expect(source).toContain('u_cameraPosition');
  });

  it('shadow-maps the directional term (and only the directional term)', () => {
    const source = getGlClassicFragmentSourceForKey(LAMBERT);
    // The shared light block already declares the shadow uniforms + sampleDirectionalShadow; the classic
    // path multiplies its directional contribution by that factor, matching the PBR family.
    expect(source).toContain('sampleDirectionalShadow(v_worldPosition, geometricNormal)');
    expect(source.match(/float sampleDirectionalShadow\(vec3 worldPos, vec3 geometricNormal\)/g)).toHaveLength(1);
    // Exactly one call — point/spot/ambient stay unshadowed, so the helper appears once in main().
    expect(source.match(/sampleDirectionalShadow\(v_worldPosition, geometricNormal\)/g)).toHaveLength(1);
  });

  it('uses reflect() for Phong and the half vector for BlinnPhong', () => {
    expect(getGlClassicFragmentSourceForKey(PHONG)).toContain('reflect(');
    expect(getGlClassicFragmentSourceForKey(BLINNPHONG)).toContain('normalize(lightDir + viewDir)');
  });

  it('emits the MAX_FORWARD_LIGHTS spec constant and loops the punctual light arrays', () => {
    const source = getGlClassicFragmentSourceForKey(LAMBERT);
    expect(source).toContain('#define MAX_FORWARD_LIGHTS');
    expect(source).toContain('u_pointLights');
    expect(source).toContain('u_spotLights');
    expect(source).toContain('u_hemisphereLights');
    // Every light type routes through the one shared classic BRDF.
    expect(source).toContain('shadeClassicLight');
  });
});

describe('getGlClassicVertexSource', () => {
  it('returns the vertex body without a version/define block', () => {
    const source = getGlClassicVertexSource();
    expect(source).toContain('a_position');
    expect(source).not.toContain('#version 300 es');
  });
});

describe('getGlClassicVertexSourceForKey', () => {
  it('passes world position, normal, tangent, and uv varyings', () => {
    const source = getGlClassicVertexSourceForKey(LAMBERT);
    expect(source).toContain('v_worldPosition');
    expect(source).toContain('v_normal');
    expect(source).toContain('v_tangent');
    expect(source).toContain('v_uv0');
    expect(source).toContain('#version 300 es');
  });

  it('injects the skin declarations and HAS_SKIN define only for the skinned variant', () => {
    // The #ifdef HAS_SKIN guard lives in the body unconditionally; only the #define and the injected
    // attribute/uniform declarations are skin-specific.
    const rigid = getGlClassicVertexSourceForKey(LAMBERT);
    expect(rigid).not.toContain('#define HAS_SKIN');
    expect(rigid).not.toContain('a_joints0');
    expect(rigid).not.toContain('mat4 skinMatrix()');

    const skinned = getGlClassicVertexSourceForKey({ ...LAMBERT, hasSkin: true });
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).not.toContain('#define MAX_JOINTS');
    expect(skinned).toContain('sampler2D u_jointTexture');
    expect(skinned).toContain('texelFetch');
    expect(skinned).toContain('mat4 skinMatrix()');
    expect(skinned).toContain('a_joints0');
    expect(skinned).toContain('a_weights0');
  });
});

describe('tangent frame under a model transform', () => {
  it('carries the tangent through the model matrix and the mirror through its handedness', () => {
    const vertex = getGlClassicVertexSource();
    expect(vertex).toContain('mat3 modelRotation = mat3(u_model);');
    expect(vertex).toContain('determinant(modelRotation) < 0.0 ? -1.0 : 1.0');
    expect(vertex).toContain('v_tangent = vec4(modelRotation * localTangent, tangentHandedness);');
    expect(vertex).toContain('v_normal = u_normalMatrix * localNormal;');
    expect(vertex).not.toContain('u_normalMatrix * localTangent');
  });
});
