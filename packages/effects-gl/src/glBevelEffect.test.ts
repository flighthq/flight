// The highlight/shadow colors are packed RGBA and their alpha multiplies the matching *Alpha field, the
// same arithmetic BitmapBevelOptions has always used offscreen. The composite shader still takes RGB plus
// one alpha, so the split happens in the runner — which makes the uniform the only place the migration is
// observable, and the reason this file mocks the draw seam rather than asserting on pixels.
import { createBevelEffect } from '@flighthq/effects/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';

import { applyBevelEffectToGl, defaultGlBevelEffectRunner, registerGlBevelEffect } from './glBevelEffect';
import * as glEffectBlitShaderMod from './glEffectBlitShader';
import * as glEffectBoxBlurMod from './glEffectBoxBlur';
import * as glEffectTintShaderMod from './glEffectTintShader';

const glMock = {
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform4f: vi.fn(),
};

// The runner caches its compiled locations per `state.gl`, and looks the uniform names up itself, so the
// fake context must answer getUniformLocation with the name — which is also what makes the assertions
// below readable as uniform names rather than opaque handles.
const state = { gl: { getUniformLocation: (_program: unknown, name: string) => name } } as never;
const target = { height: 4, texture: {}, width: 4 } as never;
const pool = { free: [], inUse: [] } as never;

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(renderGlContract, 'acquireGlRenderTarget').mockImplementation(((
    _state: unknown,
    _pool: unknown,
    descriptor: unknown,
  ) => ({
    ...(descriptor as object),
    id: `scratch-${nextTargetId++}`,
    texture: {},
  })) as never);
  vi.spyOn(renderGlContract, 'clearGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'compileGlFullscreenProgram').mockImplementation(((_gl: unknown, _source: string) => ({
    locHighlight: 'u_highlight',
    locShadow: 'u_shadow',
    program: {},
  })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation(((
    _state: never,
    _loc: never,
    _textures: never,
    _dest: never,
    setUniforms: (gl: never, program: never) => void,
  ) => {
    setUniforms(glMock as never, {} as never);
  }) as never);
  vi.spyOn(renderGlContract, 'releaseGlRenderTarget').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBlitShaderMod, 'applyGlEffectBlitOffsetPass').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectBlitShaderMod, 'applyGlEffectBlitPass').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectBlitShaderMod, 'applyGlEffectErasePass').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBoxBlurMod, 'applyGlEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectTintShaderMod, 'applyGlEffectTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function uniformFor(name: string): readonly number[] {
  const call = glMock.uniform4f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform4f call for ${name}`);
  return call.slice(1) as readonly number[];
}

describe('applyBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBevelEffectToGl).toBe('function');
  });

  it('splits each packed RGBA color into composite RGB and an alpha multiplied by its *Alpha field', () => {
    glMock.uniform4f.mockClear();

    applyBevelEffectToGl(
      state,
      target,
      target,
      pool,
      createBevelEffect({
        highlightAlpha: 0.5,
        highlightColor: 0x9d55ff80,
        shadowAlpha: 1,
        shadowColor: 0x102030c0,
      }),
    );

    // Under the 24-bit reading these same values would light the bevel 0x55ff80 and shade it 0x2030c0 —
    // both different colors, both plausible, at full opacity. That is the 0x44ffee failure shape built
    // into the API surface by construction rather than by a typo, which is what this unification removes.
    const [highlightRed, highlightGreen, highlightBlue, highlightAlpha] = uniformFor('u_highlight');
    expect(highlightRed).toBeCloseTo(0x9d / 255, 5);
    expect(highlightGreen).toBeCloseTo(0x55 / 255, 5);
    expect(highlightBlue).toBeCloseTo(1, 5);
    expect(highlightAlpha).toBeCloseTo((0x80 / 255) * 0.5, 5);

    const [shadowRed, shadowGreen, shadowBlue, shadowAlpha] = uniformFor('u_shadow');
    expect(shadowRed).toBeCloseTo(0x10 / 255, 5);
    expect(shadowGreen).toBeCloseTo(0x20 / 255, 5);
    expect(shadowBlue).toBeCloseTo(0x30 / 255, 5);
    expect(shadowAlpha).toBeCloseTo(0xc0 / 255, 5);
  });

  it('defaults to opaque white over opaque black, the pair the pre-migration defaults produced', () => {
    glMock.uniform4f.mockClear();

    applyBevelEffectToGl(state, target, target, pool, createBevelEffect());

    expect(uniformFor('u_highlight')).toEqual([1, 1, 1, 1]);
    expect(uniformFor('u_shadow')).toEqual([0, 0, 0, 1]);
  });
});

describe('defaultGlBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBevelEffectRunner).toBe('function');
  });
});

describe('registerGlBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBevelEffect).toBeTypeOf('function');
  });
});
