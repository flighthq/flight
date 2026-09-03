import type {
  GlPbrDefineKey,
  GlPbrExtensionRegistration,
  GlPbrExtensionShaderContribution,
} from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';
import { compileGlPbrProgram, ensureGlPbrProgram } from './glPbrProgramCache';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

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
    const { state, gl } = makeGlScene3DState();
    const first = ensureGlPbrProgram(state, KEY);
    const linkCount = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlPbrProgram(state, KEY);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(linkCount);
    expect(getGlScene3DRuntime(state).programCache.size).toBe(1);
  });

  it('compiles a distinct program for a different standard map flag', () => {
    const { state } = makeGlScene3DState();
    ensureGlPbrProgram(state, KEY);
    ensureGlPbrProgram(state, makeKey({ hasBaseColorMap: true }));
    expect(getGlScene3DRuntime(state).programCache.size).toBe(2);
  });

  it('folds the render-state skinned-run flag into a distinct HAS_SKIN variant', () => {
    const { state } = makeGlScene3DState();
    const rigid = ensureGlPbrProgram(state, KEY);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlPbrProgram(state, KEY);

    expect(skinned).not.toBe(rigid);
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toContain('pbr:--------:k-:0:');
    expect(skinned.locJointTexture).not.toBeNull();
  });

  it('caches a distinct entry per registered contribution key under the pbr namespace', () => {
    const { state } = makeGlScene3DState();
    ensureGlPbrProgram(state, KEY, [makeContribution('vendor-a')]);
    ensureGlPbrProgram(state, KEY, [makeContribution('vendor-b')]);
    const cache = getGlScene3DRuntime(state).programCache;
    expect(cache.size).toBe(2);
    for (const key of cache.keys()) expect(key.startsWith('pbr:')).toBe(true);
  });

  it('compiles a distinct same-key program after a PBR registration is replaced', () => {
    const { state } = makeGlScene3DState();
    const contribution = makeContribution('vendor');
    registerGlPbrExtension(state, 'VendorExtension', makeRegistration());
    const first = ensureGlPbrProgram(state, KEY, [contribution]);

    registerGlPbrExtension(state, 'VendorExtension', makeRegistration());
    const second = ensureGlPbrProgram(state, KEY, [contribution]);

    expect(second).not.toBe(first);
    expect(getGlScene3DRuntime(state).programCache.size).toBe(2);
  });
});

function makeRegistration(): GlPbrExtensionRegistration {
  return {
    bind(): void {},
    createShaderContribution: () => makeContribution('vendor'),
    isSupported: () => true,
  };
}

function makeContribution(key: string): GlPbrExtensionShaderContribution {
  return {
    applySurface: '',
    contributeIbl: '',
    contributePunctual: '',
    finalize: '',
    fragmentDeclarations: '',
    fragmentFunctions: '',
    key,
    textureCount: 0,
  };
}
