import type { GlClassicDefineKey } from './glClassicPrelude';
import {
  buildGlClassicDefineKey,
  compileGlClassicProgram,
  ensureGlClassicProgram,
  getGlClassicFragmentSource,
  getGlClassicFragmentSourceForKey,
  getGlClassicVertexSource,
  getGlClassicVertexSourceForKey,
} from './glClassicPrelude';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

const LAMBERT: GlClassicDefineKey = {
  alphaMaskEnabled: false,
  hasDiffuseMap: false,
  hasNormalMap: false,
  hasSpecularMap: false,
  lightingModel: 'lambert',
};
const PHONG: GlClassicDefineKey = { ...LAMBERT, lightingModel: 'phong' };
const BLINNPHONG: GlClassicDefineKey = { ...LAMBERT, lightingModel: 'blinnphong' };

describe('buildGlClassicDefineKey', () => {
  it('encodes the lighting model first, then the feature flags', () => {
    expect(buildGlClassicDefineKey(LAMBERT)).toBe('l----');
    expect(buildGlClassicDefineKey(PHONG)).toBe('p----');
    expect(buildGlClassicDefineKey(BLINNPHONG)).toBe('b----');
    expect(
      buildGlClassicDefineKey({
        alphaMaskEnabled: true,
        hasDiffuseMap: true,
        hasNormalMap: true,
        hasSpecularMap: true,
        lightingModel: 'phong',
      }),
    ).toBe('pmdsn');
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
    const { state, gl } = makeGlSceneState();
    const first = ensureGlClassicProgram(state, LAMBERT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlClassicProgram(state, LAMBERT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlSceneRuntime(state).programCache.keys()].some((k) => k.startsWith('classic:'))).toBe(true);
  });

  it('caches a distinct entry per lighting model', () => {
    const { state } = makeGlSceneState();
    const lambert = ensureGlClassicProgram(state, LAMBERT);
    const phong = ensureGlClassicProgram(state, PHONG);
    const blinnPhong = ensureGlClassicProgram(state, BLINNPHONG);
    expect(lambert).not.toBe(phong);
    expect(phong).not.toBe(blinnPhong);
    expect(lambert).not.toBe(blinnPhong);
    expect(getGlSceneRuntime(state).programCache.size).toBe(3);
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
  it('includes the lighting-model and feature defines only when set', () => {
    expect(getGlClassicFragmentSourceForKey(LAMBERT)).not.toContain('#define LIGHTING_PHONG');
    expect(getGlClassicFragmentSourceForKey(LAMBERT)).not.toContain('#define LIGHTING_BLINNPHONG');
    expect(getGlClassicFragmentSourceForKey(PHONG)).toContain('#define LIGHTING_PHONG');
    expect(getGlClassicFragmentSourceForKey(BLINNPHONG)).toContain('#define LIGHTING_BLINNPHONG');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasDiffuseMap: true })).toContain('#define HAS_DIFFUSE_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasSpecularMap: true })).toContain('#define HAS_SPECULAR_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, hasNormalMap: true })).toContain('#define HAS_NORMAL_MAP');
    expect(getGlClassicFragmentSourceForKey({ ...PHONG, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });

  it('includes the standard light block uniforms', () => {
    const source = getGlClassicFragmentSourceForKey(LAMBERT);
    expect(source).toContain('u_directionalRadiance');
    expect(source).toContain('u_ambientRadiance');
    expect(source).toContain('u_cameraPosition');
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
});
