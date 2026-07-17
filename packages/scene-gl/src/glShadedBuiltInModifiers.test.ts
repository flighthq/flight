import { createAnimatedNormalModifier, createEmissiveModifier, createRimModifier } from '@flighthq/shading';
import type { Texture } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  RimModifierKind,
} from '@flighthq/types';

import type { FakeGl2 } from './glSceneTestHelper';
import { makeGlSceneState } from './glSceneTestHelper';
import {
  animatedNormalGlModifierSnippet,
  emissiveGlModifierSnippet,
  registerBuiltInGlModifierSnippets,
  rimGlModifierSnippet,
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
    time: 0,
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

describe('registerBuiltInGlModifierSnippets', () => {
  it('registers all three built-in snippets on the state', () => {
    const { state } = makeGlSceneState();
    registerBuiltInGlModifierSnippets(state);
    expect(resolveGlModifierSnippet(state, AnimatedNormalModifierKind)).toBe(animatedNormalGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, EmissiveModifierKind)).toBe(emissiveGlModifierSnippet);
    expect(resolveGlModifierSnippet(state, RimModifierKind)).toBe(rimGlModifierSnippet);
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
