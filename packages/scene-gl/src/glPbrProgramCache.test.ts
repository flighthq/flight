import { compileGlPbrProgram, ensureGlPbrProgram } from './glPbrProgramCache';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

const KEY = { alphaMaskEnabled: false, hasBaseColorMap: false, hasNormalMap: false };

describe('compileGlPbrProgram', () => {
  it('compiles, links, and resolves the PBR uniform locations', () => {
    const gl = makeFakeGl2();
    const program = compileGlPbrProgram(gl, KEY);
    expect(program.program).not.toBeNull();
    expect(program.locViewProjection).not.toBeNull();
    expect(program.locBaseColor).not.toBeNull();
    expect(program.locDirectionalRadiance).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });

  it('throws on a shader compile failure', () => {
    const gl = makeFakeGl2({ compileOk: false });
    expect(() => compileGlPbrProgram(gl, KEY)).toThrow(/compile error/);
  });

  it('throws on a program link failure', () => {
    const gl = makeFakeGl2({ linkOk: false });
    expect(() => compileGlPbrProgram(gl, KEY)).toThrow(/link error/);
  });
});

describe('ensureGlPbrProgram', () => {
  it('compiles a variant once and caches it by define key', () => {
    const { state, gl } = makeGlSceneState();
    const first = ensureGlPbrProgram(state, KEY);
    const linkCount = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlPbrProgram(state, KEY);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(linkCount);
    expect(getGlSceneRuntime(state).pbrProgramCache.size).toBe(1);
  });

  it('compiles a distinct program for a different define key', () => {
    const { state } = makeGlSceneState();
    ensureGlPbrProgram(state, KEY);
    ensureGlPbrProgram(state, { alphaMaskEnabled: false, hasBaseColorMap: true, hasNormalMap: false });
    expect(getGlSceneRuntime(state).pbrProgramCache.size).toBe(2);
  });
});
