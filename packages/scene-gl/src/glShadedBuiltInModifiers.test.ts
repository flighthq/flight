import {
  createAnimatedNormalModifier,
  createDissolveModifier,
  createEmissiveModifier,
  createEnvReflectModifier,
  createFogModifier,
  createRimModifier,
  createToonModifier,
  createVertexDisplaceModifier,
} from '@flighthq/shading';
import type { Texture } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  DissolveModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  EnvReflectModifierKind,
  FogModifierKind,
  FogModifierMode,
  RimModifierKind,
  ToonModifierKind,
  VertexDisplaceModifierKind,
  VertexDisplaceModifierSource,
} from '@flighthq/types';

import type { FakeGl2 } from './glSceneTestHelper';
import { makeGlSceneState } from './glSceneTestHelper';
import {
  animatedNormalGlModifierSnippet,
  dissolveGlModifierSnippet,
  emissiveGlModifierSnippet,
  envReflectGlModifierSnippet,
  fogGlModifierSnippet,
  registerBuiltInGlModifierSnippets,
  rimGlModifierSnippet,
  toonGlModifierSnippet,
  vertexDisplaceGlModifierSnippet,
} from './glShadedBuiltInModifiers';
import type { GlModifierBindContext } from './glShadedModifierSnippet';
import { resolveGlModifierSnippet } from './glShadedModifierSnippet';

// A Texture whose image is unloaded — the snippet binds the sampler unit without an upload.
const UNLOADED_TEXTURE = { image: null } as unknown as Texture;

function makeContext(state: ReturnType<typeof makeGlSceneState>['state'], index = 0): GlModifierBindContext {
  let unit = 3;
  return {
    acquireModifierTextureUnit: () => unit++,
    index,
    program: {} as WebGLProgram,
    state,
  };
}

function countCalls(gl: FakeGl2, name: string): number {
  return gl.calls.filter((c) => c.name === name).length;
}

describe('animatedNormalGlModifierSnippet', () => {
  it('reports the disabled/single/dual define signature from map structure', () => {
    const disabled = createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } });
    const single = createAnimatedNormalModifier({ map: UNLOADED_TEXTURE, scroll: { x: 0.1, y: 0 } });
    const dual = createAnimatedNormalModifier({
      map: UNLOADED_TEXTURE,
      scroll: { x: 0.1, y: 0 },
      secondaryMap: UNLOADED_TEXTURE,
      secondaryScroll: { x: -0.05, y: 0 },
    });
    expect(animatedNormalGlModifierSnippet.getDefineSignature?.(disabled)).toBe('0');
    expect(animatedNormalGlModifierSnippet.getDefineSignature?.(single)).toBe('1');
    expect(animatedNormalGlModifierSnippet.getDefineSignature?.(dual)).toBe('2');
  });

  it('emits u_time-scrolled sampling into the normal for a mapped modifier', () => {
    const modifier = createAnimatedNormalModifier({ map: UNLOADED_TEXTURE, scroll: { x: 0.1, y: 0 } });
    const contribution = animatedNormalGlModifierSnippet.contribution(modifier, 0);
    expect(contribution).toContain('u_animNormalScroll_0 * u_time');
    expect(contribution).toContain('normal = normalize(tbn * animNormal);');
  });

  it('emits nothing for a disabled (null-map) modifier', () => {
    const modifier = createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } });
    expect(animatedNormalGlModifierSnippet.declarations?.(modifier, 0)).toBe('');
    expect(animatedNormalGlModifierSnippet.contribution(modifier, 0)).toBe('');
  });

  it('bind uploads scroll + strength and binds the sampler unit', () => {
    const { state, gl } = makeGlSceneState();
    const modifier = createAnimatedNormalModifier({ map: UNLOADED_TEXTURE, scroll: { x: 0.2, y: 0.3 }, strength: 2 });
    animatedNormalGlModifierSnippet.bind?.(modifier, makeContext(state));
    expect(countCalls(gl, 'uniform2f')).toBe(1);
    expect(countCalls(gl, 'uniform1f')).toBe(1);
    expect(countCalls(gl, 'uniform1i')).toBe(1);
  });

  it('bind is a no-op for a disabled modifier', () => {
    const { state, gl } = makeGlSceneState();
    const modifier = createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } });
    animatedNormalGlModifierSnippet.bind?.(modifier, makeContext(state));
    expect(countCalls(gl, 'uniform2f')).toBe(0);
    expect(countCalls(gl, 'uniform1i')).toBe(0);
  });

  it('drops the sampler (no bind) when the texture-unit allocator is exhausted', () => {
    const { state, gl } = makeGlSceneState();
    const modifier = createAnimatedNormalModifier({ map: UNLOADED_TEXTURE, scroll: { x: 0.2, y: 0.3 } });
    const exhausted: GlModifierBindContext = {
      acquireModifierTextureUnit: () => -1,
      index: 0,
      program: {} as WebGLProgram,
      state,
    };
    animatedNormalGlModifierSnippet.bind?.(modifier, exhausted);
    expect(countCalls(gl, 'uniform1i')).toBe(0);
    expect(countCalls(gl, 'activeTexture')).toBe(0);
  });
});

describe('dissolveGlModifierSnippet', () => {
  it('reports the procedural/mapped define signature structurally', () => {
    expect(dissolveGlModifierSnippet.getDefineSignature?.(createDissolveModifier({ threshold: 0.5 }))).toBe('');
    expect(
      dissolveGlModifierSnippet.getDefineSignature?.(createDissolveModifier({ threshold: 0.5, map: UNLOADED_TEXTURE })),
    ).toBe('m');
  });

  it('discards below threshold and tints the burn edge into the radiance', () => {
    const contribution = dissolveGlModifierSnippet.contribution(createDissolveModifier({ threshold: 0.4 }), 0);
    expect(contribution).toContain('discard;');
    expect(contribution).toContain('radiance = mix(radiance, u_dissolveEdgeColor_0, dissolveEdge);');
    expect(contribution).toContain('shadedValueNoise');
  });

  it('samples the noise map instead of procedural noise when a map is set', () => {
    const contribution = dissolveGlModifierSnippet.contribution(
      createDissolveModifier({ threshold: 0.4, map: UNLOADED_TEXTURE }),
      1,
    );
    expect(contribution).toContain('texture(u_dissolveMap_1, v_uv0).r');
    expect(contribution).not.toContain('shadedValueNoise');
  });

  it('bind uploads threshold/edge and the noise scale for the procedural variant', () => {
    const { state, gl } = makeGlSceneState();
    dissolveGlModifierSnippet.bind?.(createDissolveModifier({ threshold: 0.5 }), makeContext(state));
    // threshold + edgeWidth + scale.
    expect(countCalls(gl, 'uniform1f')).toBe(3);
    expect(countCalls(gl, 'uniform3f')).toBe(1);
  });
});

describe('emissiveGlModifierSnippet', () => {
  it('reports the mask/gate define signature structurally', () => {
    expect(emissiveGlModifierSnippet.getDefineSignature?.(createEmissiveModifier({ color: 0xffffffff }))).toBe('');
    expect(
      emissiveGlModifierSnippet.getDefineSignature?.(
        createEmissiveModifier({ color: 0xffffffff, facing: EmissiveModifierFacing.AwayFromLight }),
      ),
    ).toBe('g');
    expect(
      emissiveGlModifierSnippet.getDefineSignature?.(
        createEmissiveModifier({
          color: 0xffffffff,
          facing: EmissiveModifierFacing.AwayFromLight,
          mask: UNLOADED_TEXTURE,
        }),
      ),
    ).toBe('mg');
  });

  it('gates the contribution by facing only when gated', () => {
    const plain = emissiveGlModifierSnippet.contribution(createEmissiveModifier({ color: 0xffffffff }), 0);
    expect(plain).not.toContain('u_emissiveFacingSign_0');
    const gated = emissiveGlModifierSnippet.contribution(
      createEmissiveModifier({ color: 0xffffffff, facing: EmissiveModifierFacing.AwayFromLight }),
      0,
    );
    expect(gated).toContain('u_emissiveFacingSign_0');
    expect(gated).toContain('emissive += emissiveTerm;');
  });

  it('bind uploads color + strength, plus the facing sign when gated', () => {
    const { state, gl } = makeGlSceneState();
    emissiveGlModifierSnippet.bind?.(createEmissiveModifier({ color: 0xffcc88ff }), makeContext(state));
    expect(countCalls(gl, 'uniform3f')).toBe(1);
    const plainFloats = countCalls(gl, 'uniform1f');
    expect(plainFloats).toBe(1);

    const gated = makeGlSceneState();
    emissiveGlModifierSnippet.bind?.(
      createEmissiveModifier({ color: 0xffcc88ff, facing: EmissiveModifierFacing.AwayFromLight, facingSoftness: 0.1 }),
      makeContext(gated.state),
    );
    // strength + facing sign + facing softness.
    expect(countCalls(gated.gl, 'uniform1f')).toBe(3);
  });
});

describe('envReflectGlModifierSnippet', () => {
  it('has no define signature (single program shape)', () => {
    expect(envReflectGlModifierSnippet.getDefineSignature).toBeUndefined();
  });

  it('reflects the view vector and samples the shared prefiltered environment cube', () => {
    const contribution = envReflectGlModifierSnippet.contribution(createEnvReflectModifier(), 0);
    expect(contribution).toContain('reflect(-viewDir, normal)');
    expect(contribution).toContain('textureLod(u_iblPrefiltered, envReflectDir');
    expect(contribution).toContain('radiance +=');
  });

  it('declares the shared IBL environment samplers so two instances can be deduped', () => {
    const declarations = envReflectGlModifierSnippet.declarations?.(createEnvReflectModifier(), 0) ?? '';
    expect(declarations).toContain('uniform samplerCube u_iblPrefiltered;');
    expect(declarations).toContain('uniform float u_iblEnabled;');
  });

  it('bind uploads the tint and the three reflection scalars', () => {
    const { state, gl } = makeGlSceneState();
    envReflectGlModifierSnippet.bind?.(createEnvReflectModifier(), makeContext(state));
    expect(countCalls(gl, 'uniform3f')).toBe(1);
    // intensity + fresnel + roughness.
    expect(countCalls(gl, 'uniform1f')).toBe(3);
  });
});

describe('fogGlModifierSnippet', () => {
  it('reports the mode define signature structurally', () => {
    expect(fogGlModifierSnippet.getDefineSignature?.(createFogModifier({ color: 0xffffffff }))).toBe('l');
    expect(
      fogGlModifierSnippet.getDefineSignature?.(
        createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential }),
      ),
    ).toBe('e');
    expect(
      fogGlModifierSnippet.getDefineSignature?.(
        createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential2 }),
      ),
    ).toBe('x');
  });

  it('emits a near/far ramp for linear and an exp falloff for exponential', () => {
    const linear = fogGlModifierSnippet.contribution(createFogModifier({ color: 0xffffffff }), 0);
    expect(linear).toContain('u_fogNear_0');
    expect(linear).toContain('length(u_cameraPosition - v_worldPosition)');
    const exp = fogGlModifierSnippet.contribution(
      createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential }),
      0,
    );
    expect(exp).toContain('exp(-u_fogDensity_0 * fogDist)');
  });

  it('bind uploads the color and near/far for linear, density for exponential', () => {
    const linear = makeGlSceneState();
    fogGlModifierSnippet.bind?.(createFogModifier({ color: 0xaabbccff }), makeContext(linear.state));
    expect(countCalls(linear.gl, 'uniform3f')).toBe(1);
    expect(countCalls(linear.gl, 'uniform1f')).toBe(2);

    const exp = makeGlSceneState();
    fogGlModifierSnippet.bind?.(
      createFogModifier({ color: 0xaabbccff, mode: FogModifierMode.Exponential2, density: 0.02 }),
      makeContext(exp.state),
    );
    expect(countCalls(exp.gl, 'uniform1f')).toBe(1);
  });
});

describe('registerBuiltInGlModifierSnippets', () => {
  it('registers all eight built-in snippets on the state', () => {
    const { state } = makeGlSceneState();
    registerBuiltInGlModifierSnippets(state);
    expect(resolveGlModifierSnippet(state, AnimatedNormalModifierKind)).toBe(animatedNormalGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, EmissiveModifierKind)).toBe(emissiveGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, RimModifierKind)).toBe(rimGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, EnvReflectModifierKind)).toBe(envReflectGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, FogModifierKind)).toBe(fogGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, DissolveModifierKind)).toBe(dissolveGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, ToonModifierKind)).toBe(toonGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, VertexDisplaceModifierKind)).toBe(vertexDisplaceGlModifierSnippet);
  });
});

describe('rimGlModifierSnippet', () => {
  it('has no define signature (single program shape)', () => {
    expect(rimGlModifierSnippet.getDefineSignature).toBeUndefined();
  });

  it('adds a view-dependent Fresnel term to the radiance', () => {
    const contribution = rimGlModifierSnippet.contribution(createRimModifier({ color: 0x88ccffff }), 0);
    expect(contribution).toContain('dot(normal, viewDir)');
    expect(contribution).toContain('radiance += u_rimColor_0 * rim;');
  });

  it('bind uploads the rim color and power/intensity/bias uniforms', () => {
    const { state, gl } = makeGlSceneState();
    rimGlModifierSnippet.bind?.(createRimModifier({ color: 0x88ccffff }), makeContext(state));
    expect(countCalls(gl, 'uniform3f')).toBe(1);
    expect(countCalls(gl, 'uniform1f')).toBe(3);
  });
});

describe('toonGlModifierSnippet', () => {
  it('has no define signature (single program shape)', () => {
    expect(toonGlModifierSnippet.getDefineSignature).toBeUndefined();
  });

  it('quantizes the radiance luminance into cel bands', () => {
    const contribution = toonGlModifierSnippet.contribution(createToonModifier({ steps: 3 }), 0);
    expect(contribution).toContain('u_toonSteps_0');
    expect(contribution).toContain('radiance *=');
  });

  it('bind uploads steps (floored at 2) and smoothness', () => {
    const { state, gl } = makeGlSceneState();
    toonGlModifierSnippet.bind?.(createToonModifier({ steps: 1 }), makeContext(state));
    expect(countCalls(gl, 'uniform1f')).toBe(2);
    const stepsCall = gl.calls.find((c) => c.name === 'uniform1f');
    expect(stepsCall?.args[1]).toBe(2);
  });
});

describe('vertexDisplaceGlModifierSnippet', () => {
  it('reports the source and fixed-axis define signature structurally', () => {
    expect(
      vertexDisplaceGlModifierSnippet.getDefineSignature?.(
        createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 1 }),
      ),
    ).toBe('s');
    expect(
      vertexDisplaceGlModifierSnippet.getDefineSignature?.(
        createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.HeightMap, amplitude: 1 }),
      ),
    ).toBe('h');
    expect(
      vertexDisplaceGlModifierSnippet.getDefineSignature?.(
        createVertexDisplaceModifier({
          source: VertexDisplaceModifierSource.Sine,
          amplitude: 1,
          axis: { x: 0, y: 1, z: 0 },
        }),
      ),
    ).toBe('sa');
  });

  it('displaces localPosition along the normal with a u_time-scrolled sine wave', () => {
    const contribution = vertexDisplaceGlModifierSnippet.contribution(
      createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 0.2 }),
      0,
    );
    expect(contribution).toContain('normalize(localNormal)');
    expect(contribution).toContain('u_time * u_vDisplaceSpeed_0');
    expect(contribution).toContain('localPosition.xyz += vDisplaceAxis * vDisplaceAmount;');
  });

  it('reads the height map and a fixed axis when configured', () => {
    const contribution = vertexDisplaceGlModifierSnippet.contribution(
      createVertexDisplaceModifier({
        source: VertexDisplaceModifierSource.HeightMap,
        amplitude: 1,
        axis: { x: 0, y: 1, z: 0 },
      }),
      2,
    );
    expect(contribution).toContain('texture(u_vDisplaceMap_2, vertexUv).r');
    expect(contribution).toContain('normalize(u_vDisplaceAxis_2)');
  });

  it('bind uploads amplitude plus the sine wave params for the procedural source', () => {
    const { state, gl } = makeGlSceneState();
    vertexDisplaceGlModifierSnippet.bind?.(
      createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 0.3 }),
      makeContext(state),
    );
    // amplitude + frequency + speed.
    expect(countCalls(gl, 'uniform1f')).toBe(3);
    // direction.
    expect(countCalls(gl, 'uniform3f')).toBe(1);
  });
});
