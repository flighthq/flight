import type { LinearColor, GlMatcapDefineKey } from '@flighthq/types';

import {
  bindGlMatcapSurface,
  buildGlMatcapDefineKey,
  compileGlMatcapProgram,
  ensureGlMatcapProgram,
  getGlMatcapFragmentSourceForKey,
  getGlMatcapVertexSourceForKey,
} from './glMatcapPrelude';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

const FLAT: GlMatcapDefineKey = { alphaMaskEnabled: false, hasMatcap: false };
const TINT: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindGlMatcapSurface', () => {
  it('uploads the tint and alpha cutoff with no texture bind when the matcap is absent', () => {
    const { state, gl } = makeGlSceneState();
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
    expect(buildGlMatcapDefineKey(FLAT)).toBe('--');
    expect(buildGlMatcapDefineKey({ alphaMaskEnabled: true, hasMatcap: true })).toBe('mt');
    expect(buildGlMatcapDefineKey({ ...FLAT, hasMatcap: true })).toBe('-t');
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
    const { state, gl } = makeGlSceneState();
    const first = ensureGlMatcapProgram(state, FLAT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlMatcapProgram(state, FLAT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlSceneRuntime(state).programCache.keys()].some((k) => k.startsWith('matcap:'))).toBe(true);
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
    expect(src).toContain('mat3(u_view) * (u_normalMatrix * a_normal)');
  });
});
