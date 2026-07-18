import { createEmissiveModifier, createModifierRegistry, registerModifier } from '@flighthq/shading';
import type { Modifier } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';
import { emissiveGlModifierSnippet } from './glShadedBuiltInModifiers';
import { registerBuiltInGlModifierSnippets } from './glShadedBuiltInModifiers';
import type { GlShadedDefineKey } from './glShadedPrelude';
import { buildGlShadedCacheKey, compileGlShadedProgram, ensureGlShadedProgram } from './glShadedPrelude';

const BASE_KEY: GlShadedDefineKey = {
  alphaMaskEnabled: false,
  hasDiffuseMap: false,
  hasNormalMap: false,
  hasSpecularMap: false,
  hasUvTransform: false,
};

function fragmentSourceFrom(calls: { name: string; args: unknown[] }[]): string {
  const source = calls.find((c) => c.name === 'shaderSource' && String(c.args[1]).includes('fragColor'));
  return String(source?.args[1] ?? '');
}

function vertexSourceFrom(calls: { name: string; args: unknown[] }[]): string {
  const source = calls.find(
    (c) =>
      c.name === 'shaderSource' && String(c.args[1]).includes('a_position') && !String(c.args[1]).includes('fragColor'),
  );
  return String(source?.args[1] ?? '');
}

describe('buildGlShadedCacheKey', () => {
  it('namespaces under shaded: and joins base flags with the modifier define-key', () => {
    expect(buildGlShadedCacheKey(BASE_KEY, '')).toBe('shaded:------|');
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasDiffuseMap: true }, 'EmissiveModifier:m')).toBe(
      'shaded:-d----|EmissiveModifier:m',
    );
  });

  it('encodes a non-identity uv transform in the u slot ahead of skin', () => {
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasUvTransform: true }, '')).toBe('shaded:----u-|');
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasUvTransform: true }, '')).not.toBe(
      buildGlShadedCacheKey(BASE_KEY, ''),
    );
  });

  it('sets the trailing skin flag so a skinned variant keys distinctly from the rigid one', () => {
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasSkin: true }, '')).toBe('shaded:-----k|');
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasSkin: true }, '')).not.toBe(buildGlShadedCacheKey(BASE_KEY, ''));
  });
});

describe('compileGlShadedProgram', () => {
  it('assembles the lean base shader with no modifier GLSL for an empty stack', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, BASE_KEY, [], createModifierRegistry());
    const fragment = fragmentSourceFrom(gl.calls);
    expect(fragment).toContain('void main()');
    expect(fragment).toContain('fragColor');
    expect(fragment).not.toContain('u_emissiveColor');
  });

  it('injects a registered modifier snippet at its slot hook', () => {
    const gl = makeFakeGl2();
    const registry = createModifierRegistry();
    registerModifier(registry, emissiveGlModifierSnippet);
    const modifiers: readonly Modifier[] = [createEmissiveModifier({ color: 0xffcc88ff })];
    compileGlShadedProgram(gl, BASE_KEY, modifiers, registry);
    const fragment = fragmentSourceFrom(gl.calls);
    expect(fragment).toContain('uniform vec3 u_emissiveColor_0;');
    expect(fragment).toContain('emissive += emissiveTerm;');
  });

  it('reuses GL_MESH_LIGHT_BLOCK_GLSL rather than declaring a second light block', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, BASE_KEY, [], createModifierRegistry());
    const fragment = fragmentSourceFrom(gl.calls);
    // The shared block declares u_directional exactly once (no forked light loop).
    expect(fragment.split('uniform vec4 u_directional;').length - 1).toBe(1);
  });

  it('injects the skin define + vertex declarations only into the skinned vertex source', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, { ...BASE_KEY, hasSkin: true }, [], createModifierRegistry());
    const vertex = vertexSourceFrom(gl.calls);
    expect(vertex).toContain('#define HAS_SKIN');
    expect(vertex).toContain('#define MAX_JOINTS');
    expect(vertex).toContain('mat4 skinMatrix()');
    expect(vertex).toContain('a_joints0');
    // Skinning is vertex-only — the fragment stage never sees the skin attributes.
    expect(fragmentSourceFrom(gl.calls)).not.toContain('a_joints0');
  });

  it('leaves the rigid vertex source free of the skin define and declarations', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, BASE_KEY, [], createModifierRegistry());
    const vertex = vertexSourceFrom(gl.calls);
    expect(vertex).not.toContain('#define HAS_SKIN');
    expect(vertex).not.toContain('a_joints0');
    expect(fragmentSourceFrom(gl.calls)).not.toContain('a_joints0');
  });
});

describe('ensureGlShadedProgram', () => {
  it('caches the compiled program under a shaded: key and reuses it', () => {
    const { state } = makeGlSceneState();
    const first = ensureGlShadedProgram(state, BASE_KEY, []);
    const second = ensureGlShadedProgram(state, BASE_KEY, []);
    expect(second).toBe(first);
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('shaded:'))).toBe(true);
  });

  it('folds the render-state skinned-run flag into a distinct HAS_SKIN variant', () => {
    const { state } = makeGlSceneState();
    const rigid = ensureGlShadedProgram(state, BASE_KEY, []);
    getGlSceneRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlShadedProgram(state, BASE_KEY, []);

    expect(skinned).not.toBe(rigid);
    expect([...getGlSceneRuntime(state).programCache.keys()]).toContain('shaded:-----k|');
    expect(skinned.locJointMatrices).not.toBeNull();
  });

  it('compiles distinct variants for distinct modifier feature-sets', () => {
    const { state } = makeGlSceneState();
    registerBuiltInGlModifierSnippets(state);
    ensureGlShadedProgram(state, BASE_KEY, []);
    ensureGlShadedProgram(state, BASE_KEY, [createEmissiveModifier({ color: 0xffffffff })]);
    const keys = [...getGlSceneRuntime(state).programCache.keys()].filter((k) => k.startsWith('shaded:'));
    expect(new Set(keys).size).toBe(2);
  });
});
