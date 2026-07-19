import type { GlPbrDefineKey } from './glPbrPrelude';
import { compileGlPbrProgram, ensureGlPbrProgram } from './glPbrProgramCache';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

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
    hasUvTransform: false,
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
    ...overrides,
  };
}

const KEY = makeKey();

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

  it('resolves the full standard-block map uniforms', () => {
    const gl = makeFakeGl2();
    const program = compileGlPbrProgram(gl, KEY);
    expect(program.locMetallicRoughnessMap).not.toBeNull();
    expect(program.locOcclusionMap).not.toBeNull();
    expect(program.locOcclusionStrength).not.toBeNull();
    expect(program.locEmissiveMap).not.toBeNull();
  });

  it('resolves every extension uniform', () => {
    const gl = makeFakeGl2();
    const program = compileGlPbrProgram(gl, KEY);
    expect(program.locClearcoat).not.toBeNull();
    expect(program.locSheenColor).not.toBeNull();
    expect(program.locAnisotropyStrength).not.toBeNull();
    expect(program.locIridescence).not.toBeNull();
    expect(program.locSpecular).not.toBeNull();
    expect(program.locSubsurface).not.toBeNull();
    expect(program.locTransmission).not.toBeNull();
    expect(program.locAttenuationColor).not.toBeNull();
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
    expect(getGlSceneRuntime(state).programCache.size).toBe(1);
  });

  it('compiles a distinct program for a different standard map flag', () => {
    const { state } = makeGlSceneState();
    ensureGlPbrProgram(state, KEY);
    ensureGlPbrProgram(state, makeKey({ hasBaseColorMap: true }));
    expect(getGlSceneRuntime(state).programCache.size).toBe(2);
  });

  it('folds the render-state skinned-run flag into a distinct HAS_SKIN variant', () => {
    const { state } = makeGlSceneState();
    const rigid = ensureGlPbrProgram(state, KEY);
    getGlSceneRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlPbrProgram(state, KEY);

    expect(skinned).not.toBe(rigid);
    expect([...getGlSceneRuntime(state).programCache.keys()]).toContain('pbr:-------:-------k');
    expect(skinned.locJointTexture).not.toBeNull();
  });

  it('caches a distinct entry per extension define under the pbr: namespace', () => {
    const { state } = makeGlSceneState();
    ensureGlPbrProgram(state, makeKey({ clearcoatEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ sheenEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ anisotropyEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ iridescenceEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ specularEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ subsurfaceEnabled: true }));
    ensureGlPbrProgram(state, makeKey({ transmissionEnabled: true }));
    const cache = getGlSceneRuntime(state).programCache;
    expect(cache.size).toBe(7);
    for (const key of cache.keys()) expect(key.startsWith('pbr:')).toBe(true);
  });
});
