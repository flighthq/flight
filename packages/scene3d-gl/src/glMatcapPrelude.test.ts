import type { LinearColor, GlMatcapDefineKey } from '@flighthq/types/contract';

import {
  bindGlMatcapSurface,
  buildGlMatcapDefineKey,
  compileGlMatcapProgram,
  ensureGlMatcapProgram,
  getGlMatcapFragmentSourceForKey,
  getGlMatcapVertexSourceForKey,
} from './glMatcapPrelude';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

const FLAT: GlMatcapDefineKey = { alphaMaskEnabled: false, hasMatcap: false };
const TINT: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindGlMatcapSurface', () => {
  it('uploads the tint and alpha cutoff with no texture bind when the matcap is absent', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlMatcapProgram(gl, FLAT);
    bindGlMatcapSurface(state, program, TINT, null, 0.5);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
    // No matcap → no texture bind.
    expect(gl.calls.some((c) => c.name === 'bindTexture')).toBe(false);
  });
});

describe('buildGlMatcapDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildGlMatcapDefineKey(FLAT)).toBe('---');
    expect(buildGlMatcapDefineKey({ alphaMaskEnabled: true, hasMatcap: true })).toBe('mt-');
    expect(buildGlMatcapDefineKey({ ...FLAT, hasMatcap: true })).toBe('-t-');
    expect(buildGlMatcapDefineKey({ ...FLAT, hasSkin: true })).toBe('--k');
  });
});

describe('compileGlMatcapProgram', () => {
  it('compiles, links, and resolves the matcap uniforms including the normal matrix and view', () => {
    const gl = makeFakeGl2();
    const program = compileGlMatcapProgram(gl, FLAT);
    expect(program.locTint).not.toBeNull();
    expect(program.locView).not.toBeNull();
    expect(program.locNormalMatrix).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlMatcapProgram', () => {
  it('caches a variant under the matcap namespace and reuses it', () => {
    const { state, gl } = makeGlScene3DState();
    const first = ensureGlMatcapProgram(state, FLAT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlMatcapProgram(state, FLAT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlScene3DRuntime(state).programCache.keys()].some((k) => k.startsWith('matcap:'))).toBe(true);
  });

  it('caches rigid and skinned variants independently from the active draw run', () => {
    const { state } = makeGlScene3DState();
    const rigid = ensureGlMatcapProgram(state, FLAT);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlMatcapProgram(state, FLAT);

    expect(skinned).not.toBe(rigid);
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toEqual(['matcap:---', 'matcap:--k']);
  });
});

describe('getGlMatcapFragmentSourceForKey', () => {
  it('includes feature defines only when their flag is set', () => {
    expect(getGlMatcapFragmentSourceForKey(FLAT)).not.toContain('#define HAS_MATCAP');
    expect(getGlMatcapFragmentSourceForKey({ ...FLAT, hasMatcap: true })).toContain('#define HAS_MATCAP');
    expect(getGlMatcapFragmentSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });
});

describe('getGlMatcapVertexSourceForKey', () => {
  it('builds the view-space normal from u_view and the normal matrix', () => {
    const src = getGlMatcapVertexSourceForKey(FLAT);
    expect(src).toContain('layout(location = 1) in vec3 a_normal');
    expect(src).toContain('mat3(u_view) * (u_normalMatrix * localNormal)');
  });

  it('deforms position and normal only in the skinned variant', () => {
    const rigid = getGlMatcapVertexSourceForKey(FLAT);
    const skinned = getGlMatcapVertexSourceForKey({ ...FLAT, hasSkin: true });

    expect(rigid).not.toContain('#define HAS_SKIN');
    expect(rigid).not.toContain('skinMatrix() *');
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).toContain('uniform highp sampler2D u_jointTexture');
    expect(skinned).toContain('mat4 skin = skinMatrix()');
    expect(skinned).toContain('skinNormalMatrix() * a_normal');
    expect(skinned).toContain('u_model * localPosition');
  });
});
