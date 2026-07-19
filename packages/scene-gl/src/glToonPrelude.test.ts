import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';
import type { GlToonDefineKey } from './glToonPrelude';
import {
  buildGlToonDefineKey,
  compileGlToonProgram,
  ensureGlToonProgram,
  getGlToonFragmentSourceForKey,
  getGlToonVertexSourceForKey,
} from './glToonPrelude';

const FLAT: GlToonDefineKey = {
  alphaMaskEnabled: false,
  hasBaseColorMap: false,
  hasRamp: false,
  hasUvTransform: false,
};

describe('buildGlToonDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildGlToonDefineKey(FLAT)).toBe('-----');
    expect(
      buildGlToonDefineKey({ alphaMaskEnabled: true, hasBaseColorMap: true, hasRamp: true, hasUvTransform: true }),
    ).toBe('mbru-');
    expect(buildGlToonDefineKey({ ...FLAT, hasRamp: true })).toBe('--r--');
  });

  it('encodes a non-identity uv transform in the u slot ahead of skin', () => {
    expect(buildGlToonDefineKey({ ...FLAT, hasUvTransform: true })).toBe('---u-');
    expect(buildGlToonDefineKey({ ...FLAT, hasUvTransform: true })).not.toBe(buildGlToonDefineKey(FLAT));
  });

  it('appends a skinned flag that differs from the rigid key', () => {
    expect(buildGlToonDefineKey({ ...FLAT, hasSkin: true })).toBe('----k');
    expect(buildGlToonDefineKey({ ...FLAT, hasSkin: true })).not.toBe(buildGlToonDefineKey(FLAT));
  });
});

describe('compileGlToonProgram', () => {
  it('compiles, links, and resolves the lit + toon uniform locations', () => {
    const gl = makeFakeGl2();
    const program = compileGlToonProgram(gl, FLAT);
    // Lit base locations (spread from resolveGlLitLocations).
    expect(program.locDirectional).not.toBeNull();
    expect(program.locAmbientRadiance).not.toBeNull();
    expect(program.locCameraPosition).not.toBeNull();
    // Toon material locations.
    expect(program.locBaseColor).not.toBeNull();
    expect(program.locSteps).not.toBeNull();
    expect(program.locRamp).not.toBeNull();
    expect(program.locBaseColorMap).not.toBeNull();
    expect(program.locAlphaCutoff).not.toBeNull();
    // Shared vertex transforms.
    expect(program.locModel).not.toBeNull();
    expect(program.locNormalMatrix).not.toBeNull();
    expect(program.locViewProjection).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlToonProgram', () => {
  it('caches a variant under the toon namespace and reuses it', () => {
    const { state, gl } = makeGlSceneState();
    const first = ensureGlToonProgram(state, FLAT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlToonProgram(state, FLAT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlSceneRuntime(state).programCache.keys()].some((k) => k.startsWith('toon:'))).toBe(true);
  });
});

describe('getGlToonFragmentSourceForKey', () => {
  it('includes the light block and gates feature defines on their flag', () => {
    expect(getGlToonFragmentSourceForKey(FLAT)).toContain('u_directional');
    expect(getGlToonFragmentSourceForKey(FLAT)).toContain('#define MAX_FORWARD_LIGHTS');
    expect(getGlToonFragmentSourceForKey(FLAT)).not.toContain('#define HAS_BASE_COLOR_MAP');
    expect(getGlToonFragmentSourceForKey(FLAT)).not.toContain('#define HAS_RAMP');
    expect(getGlToonFragmentSourceForKey({ ...FLAT, hasBaseColorMap: true })).toContain('#define HAS_BASE_COLOR_MAP');
    expect(getGlToonFragmentSourceForKey({ ...FLAT, hasRamp: true })).toContain('#define HAS_RAMP');
    expect(getGlToonFragmentSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });
});

describe('getGlToonVertexSourceForKey', () => {
  it('passes world position and normal varyings through the shared vertex transforms', () => {
    const source = getGlToonVertexSourceForKey(FLAT);
    expect(source).toContain('#version 300 es');
    expect(source).toContain('v_worldPosition');
    expect(source).toContain('v_normal');
    expect(source).toContain('u_viewProjection');
    expect(source).toContain('u_normalMatrix');
  });

  it('injects the skin declarations only for the skinned variant', () => {
    const skinned = getGlToonVertexSourceForKey({ ...FLAT, hasSkin: true });
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).not.toContain('#define MAX_JOINTS');
    expect(skinned).toContain('sampler2D u_jointTexture');
    expect(skinned).toContain('texelFetch');
    expect(skinned).toContain('mat4 skinMatrix()');
    expect(skinned).toContain('a_joints0');
    const rigid = getGlToonVertexSourceForKey(FLAT);
    expect(rigid).not.toContain('#define HAS_SKIN');
    expect(rigid).not.toContain('a_joints0');
  });
});
