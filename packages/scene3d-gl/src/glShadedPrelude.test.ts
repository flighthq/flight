import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createEmissiveModifier,
  createEnvReflectModifier,
  createModifierRegistry,
  createVertexDisplaceModifier,
  registerModifier,
} from '@flighthq/shading/contract';
import type { GlColorAdjustmentMaterialFeature, Modifier, GlShadedDefineKey } from '@flighthq/types/contract';
import { ModifierSlot, VertexDisplaceModifierSource } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';
import { emissiveGlModifierSnippet, envReflectGlModifierSnippet } from './glShadedBuiltInModifiers';
import { registerBuiltInGlModifierSnippets, vertexDisplaceGlModifierSnippet } from './glShadedBuiltInModifiers';
import { registerGlModifierSnippet } from './glShadedModifierSnippet';
import { buildGlShadedCacheKey, compileGlShadedProgram, ensureGlShadedProgram } from './glShadedPrelude';

const BASE_KEY: GlShadedDefineKey = {
  alphaMaskEnabled: false,
  hasDiffuseMap: false,
  hasNormalMap: false,
  hasSpecularMap: false,
  hasUvTransform: false,
};
const COLOR_FEATURE: GlColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }',
  matrixFragmentShaderChunk:
    'vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }',
  drawShapeMeshes: () => {},
  flush: () => false,
  record: () => {},
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
    expect(buildGlShadedCacheKey(BASE_KEY, '')).toBe('shaded:-------|');
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasDiffuseMap: true }, 'EmissiveModifier:m')).toBe(
      'shaded:-d-----|EmissiveModifier:m',
    );
  });

  it('encodes a non-identity uv transform in the u slot ahead of skin', () => {
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasUvTransform: true }, '')).toBe('shaded:----u--|');
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasUvTransform: true }, '')).not.toBe(
      buildGlShadedCacheKey(BASE_KEY, ''),
    );
  });

  it('sets the trailing skin flag so a skinned variant keys distinctly from the rigid one', () => {
    expect(buildGlShadedCacheKey({ ...BASE_KEY, hasSkin: true }, '')).toBe('shaded:-----k-|');
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

  it('Gram-Schmidt-reorthogonalizes the tangent frame before sampling the normal map', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, { ...BASE_KEY, hasNormalMap: true }, [], createModifierRegistry());
    const fragment = fragmentSourceFrom(gl.calls);
    // The interpolated tangent is projected off the normal (the fix for the skewed-TBN normal-map bug).
    expect(fragment).toContain('v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal)');
    expect(fragment).toContain('normal = normalize(tbn * baseTangentNormal);');
  });

  it('carries the tangent through the model matrix and the mirror through its handedness', () => {
    // A tangent is a true surface vector and follows the model matrix; only the normal is a covector
    // needing the inverse-transpose. They agree under rotation and uniform scale — which is why one
    // shared u_normalMatrix looked right — and diverge under non-uniform scale, tilting the tangent
    // off the surface. And the bitangent is rebuilt as w * cross(N, T), so a mirroring model
    // transform must reach tangent.w or every mirrored instance lights with a flipped frame.
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, { ...BASE_KEY, hasNormalMap: true }, [], createModifierRegistry());
    const vertex = vertexSourceFrom(gl.calls);
    expect(vertex).toContain('mat3 modelRotation = mat3(u_model);');
    expect(vertex).toContain('v_tangent = vec4(modelRotation * localTangent, tangentHandedness);');
    expect(vertex).toContain('determinant(modelRotation) < 0.0 ? -1.0 : 1.0');
    // The normal keeps the inverse-transpose: the point is that the two DIVERGE, not that the
    // tangent's matrix replaced both.
    expect(vertex).toContain('v_normal = u_normalMatrix * localNormal;');
    // And the tangent must no longer ride the normal's matrix at all.
    expect(vertex).not.toContain('u_normalMatrix * localTangent');
  });

  it('reuses GL_MESH_LIGHT_BLOCK_GLSL rather than declaring a second light block', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, BASE_KEY, [], createModifierRegistry());
    const fragment = fragmentSourceFrom(gl.calls);
    // The shared block declares u_directional exactly once (no forked light loop).
    expect(fragment.split('uniform vec4 u_directional;').length - 1).toBe(1);
    expect(fragment.match(/float sampleDirectionalShadow\(vec3 worldPos, vec3 geometricNormal\)/g)).toHaveLength(1);
  });

  it('injects the skin define + vertex declarations only into the skinned vertex source', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, { ...BASE_KEY, hasSkin: true }, [], createModifierRegistry());
    const vertex = vertexSourceFrom(gl.calls);
    expect(vertex).toContain('#define HAS_SKIN');
    expect(vertex).not.toContain('#define MAX_JOINTS');
    expect(vertex).toContain('sampler2D u_jointTexture');
    expect(vertex).toContain('texelFetch');
    expect(vertex).toContain('mat4 skinMatrix()');
    expect(vertex).toContain('a_joints0');
    // Skinning is vertex-only — the fragment scene2d never sees the skin attributes.
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

  it('splices color adjustment after shading only for the promoted variant', () => {
    const baseGl = makeFakeGl2();
    compileGlShadedProgram(baseGl, BASE_KEY, [], createModifierRegistry(), COLOR_FEATURE);
    expect(fragmentSourceFrom(baseGl.calls)).not.toContain('vec4 applyFlightColorAdjustment');

    const adjustedGl = makeFakeGl2();
    compileGlShadedProgram(
      adjustedGl,
      { ...BASE_KEY, hasColorAdjustment: true },
      [],
      createModifierRegistry(),
      COLOR_FEATURE,
    );
    const adjusted = fragmentSourceFrom(adjustedGl.calls);
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('fragColor = applyFlightColorAdjustment');
  });

  it('splices the full-matrix adjustment after shading', () => {
    const gl = makeFakeGl2();
    compileGlShadedProgram(gl, { ...BASE_KEY, hasColorMatrix: true }, [], createModifierRegistry(), COLOR_FEATURE);
    const source = fragmentSourceFrom(gl.calls);
    expect(source).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(source).toContain('fragColor = applyFlightColorMatrix');
  });

  it('injects a Vertex-slot modifier into the vertex source, never the fragment', () => {
    const gl = makeFakeGl2();
    const registry = createModifierRegistry();
    registerModifier(registry, vertexDisplaceGlModifierSnippet);
    const modifiers: readonly Modifier[] = [
      createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 0.2 }),
    ];
    compileGlShadedProgram(gl, BASE_KEY, modifiers, registry);
    const vertex = vertexSourceFrom(gl.calls);
    expect(vertex).toContain('localPosition.xyz += vDisplaceAxis * vDisplaceAmount;');
    expect(vertex).toContain('uniform float u_vDisplaceAmplitude_0;');
    expect(fragmentSourceFrom(gl.calls)).not.toContain('u_vDisplaceAmplitude_0');
  });

  it('dedupes the shared IBL environment declaration across two env-reflect modifiers', () => {
    const gl = makeFakeGl2();
    const registry = createModifierRegistry();
    registerModifier(registry, envReflectGlModifierSnippet);
    const modifiers: readonly Modifier[] = [createEnvReflectModifier(), createEnvReflectModifier()];
    compileGlShadedProgram(gl, BASE_KEY, modifiers, registry);
    const fragment = fragmentSourceFrom(gl.calls);
    // The shared samplerCube declares once (deduped), while the per-instance tints stay distinct.
    expect(fragment.split('uniform samplerCube u_iblPrefiltered;').length - 1).toBe(1);
    expect(fragment).toContain('u_envReflectTint_0');
    expect(fragment).toContain('u_envReflectTint_1');
  });
});

describe('ensureGlShadedProgram', () => {
  it('caches the compiled program under a shaded: key and reuses it', () => {
    const { state } = makeGlScene3DState();
    const first = ensureGlShadedProgram(state, BASE_KEY, []);
    const second = ensureGlShadedProgram(state, BASE_KEY, []);
    expect(second).toBe(first);
    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('shaded:'))).toBe(true);
  });

  it('folds the render-state skinned-run flag into a distinct HAS_SKIN variant', () => {
    const { state } = makeGlScene3DState();
    const rigid = ensureGlShadedProgram(state, BASE_KEY, []);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlShadedProgram(state, BASE_KEY, []);

    expect(skinned).not.toBe(rigid);
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toContain('shaded:-----k-||registry:0');
    expect(skinned.locJointTexture).not.toBeNull();
  });

  it('compiles distinct variants for distinct modifier feature-sets', () => {
    const { state } = makeGlScene3DState();
    registerBuiltInGlModifierSnippets(state);
    ensureGlShadedProgram(state, BASE_KEY, []);
    ensureGlShadedProgram(state, BASE_KEY, [createEmissiveModifier({ color: 0xffffffff })]);
    const keys = [...getGlScene3DRuntime(state).programCache.keys()].filter((k) => k.startsWith('shaded:'));
    expect(new Set(keys).size).toBe(2);
  });

  it('recompiles after a last-write-wins snippet replacement with the same define signature', () => {
    const { gl, state } = makeGlScene3DState();
    const modifier = (() => {
      const out = allocateEntity<unknown>();
      out.kind = 'acme.Replace';
      out.slot = ModifierSlot.Effect;
      return finishEntity(out) as Modifier;;
    })();
    ensureGlShadedProgram(state, BASE_KEY, [modifier]);
    const before = gl.calls.filter((call) => call.name === 'linkProgram').length;

    registerGlModifierSnippet(state, {
      contribution: () => '// compiler-marker-B',
      kind: modifier.kind,
      slot: modifier.slot,
    });
    ensureGlShadedProgram(state, BASE_KEY, [modifier]);

    expect(gl.calls.filter((call) => call.name === 'linkProgram')).toHaveLength(before + 1);
    expect(
      gl.calls.some((call) => call.name === 'shaderSource' && String(call.args[1]).includes('compiler-marker-B')),
    ).toBe(true);
  });
});
