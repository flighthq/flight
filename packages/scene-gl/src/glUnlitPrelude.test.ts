import type { LinearColor } from '@flighthq/color';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';
import type { GlUnlitDefineKey } from './glUnlitPrelude';
import {
  bindGlUnlitSurface,
  buildGlUnlitDefineKey,
  compileGlUnlitProgram,
  ensureGlUnlitProgram,
  getGlUnlitFragmentSourceForKey,
  getGlUnlitVertexSourceForKey,
} from './glUnlitPrelude';

const FLAT: GlUnlitDefineKey = { alphaMaskEnabled: false, hasColorMap: false, vertexColor: false };
const COLOR: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindGlUnlitSurface', () => {
  it('uploads the color, intensity, and alpha cutoff', () => {
    const { state, gl } = makeGlSceneState();
    const program = compileGlUnlitProgram(gl, FLAT);
    bindGlUnlitSurface(state, program, COLOR, 2, null, 0.5);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
    // No color map → no texture bind.
    expect(gl.calls.some((c) => c.name === 'bindTexture')).toBe(false);
  });
});

describe('buildGlUnlitDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildGlUnlitDefineKey(FLAT)).toBe('----');
    expect(buildGlUnlitDefineKey({ alphaMaskEnabled: true, hasColorMap: true, vertexColor: true })).toBe('mcv-');
    expect(buildGlUnlitDefineKey({ ...FLAT, vertexColor: true })).toBe('--v-');
  });

  it('encodes the skinned variant with a trailing k and keys it distinctly', () => {
    expect(buildGlUnlitDefineKey({ ...FLAT, hasSkin: true }).endsWith('k')).toBe(true);
    expect(buildGlUnlitDefineKey({ ...FLAT, hasSkin: true })).not.toBe(buildGlUnlitDefineKey(FLAT));
  });
});

describe('compileGlUnlitProgram', () => {
  it('compiles, links, and resolves the unlit uniforms with a null normal matrix', () => {
    const gl = makeFakeGl2();
    const program = compileGlUnlitProgram(gl, FLAT);
    expect(program.locColor).not.toBeNull();
    expect(program.locIntensity).not.toBeNull();
    expect(program.locNormalMatrix).toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlUnlitProgram', () => {
  it('caches a variant under the unlit namespace and reuses it', () => {
    const { state, gl } = makeGlSceneState();
    const first = ensureGlUnlitProgram(state, FLAT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlUnlitProgram(state, FLAT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlSceneRuntime(state).programCache.keys()].some((k) => k.startsWith('unlit:'))).toBe(true);
  });

  it('compiles the skinned variant as a distinct cache entry', () => {
    const { state } = makeGlSceneState();
    ensureGlUnlitProgram(state, FLAT);
    getGlSceneRuntime(state).activeSkinnedRun = true;
    ensureGlUnlitProgram(state, FLAT);
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('unlit:') && k.endsWith('k'))).toBe(true);
    expect(keys.filter((k) => k.startsWith('unlit:')).length).toBe(2);
  });
});

describe('getGlUnlitFragmentSourceForKey', () => {
  it('includes feature defines only when their flag is set', () => {
    expect(getGlUnlitFragmentSourceForKey(FLAT)).not.toContain('#define HAS_COLOR_MAP');
    expect(getGlUnlitFragmentSourceForKey({ ...FLAT, hasColorMap: true })).toContain('#define HAS_COLOR_MAP');
    expect(getGlUnlitFragmentSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });
});

describe('getGlUnlitVertexSourceForKey', () => {
  it('defines VERTEX_COLOR only in the vertex-color variant', () => {
    expect(getGlUnlitVertexSourceForKey(FLAT)).not.toContain('#define VERTEX_COLOR');
    expect(getGlUnlitVertexSourceForKey({ ...FLAT, vertexColor: true })).toContain('#define VERTEX_COLOR');
    // The color0 attribute lives behind the #ifdef, so it is present in the body string either way.
    expect(getGlUnlitVertexSourceForKey({ ...FLAT, vertexColor: true })).toContain('a_color0');
  });

  it('splices the skin declarations and HAS_SKIN defines only in the skinned variant', () => {
    const skinned = getGlUnlitVertexSourceForKey({ ...FLAT, hasSkin: true });
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).toContain('#define MAX_JOINTS');
    expect(skinned).toContain('mat4 skinMatrix()');
    expect(skinned).toContain('a_joints0');
    const flat = getGlUnlitVertexSourceForKey(FLAT);
    expect(flat).not.toContain('#define HAS_SKIN');
    expect(flat).not.toContain('a_joints0');
  });
});
