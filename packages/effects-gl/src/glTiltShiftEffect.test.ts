import { createGlRenderState } from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, TiltShiftEffect } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));
const glMock = vi.hoisted(() => ({
  uniform1f: vi.fn((_location: unknown, _value: number) => {}),
  uniform2f: vi.fn((_location: unknown, _x: number, _y: number) => {}),
}));

vi.mock('./glEffectProgramCache', () => programMock);

// Partial, not wholesale: `createGlRenderState` and the runtime accessor the registry reaches through
// must stay real, or the registration test below would be asserting against a mock of itself.
vi.mock('@flighthq/render-gl/contract', async () => {
  const actual = (await vi.importActual('@flighthq/render-gl/contract')) as Record<string, unknown>;
  return {
    ...actual,
    drawGlFullscreenPass: vi.fn((_state, _program, _textures, _dest, setUniforms) => {
      setUniforms({ ...glMock, getUniformLocation: (_p: unknown, name: string) => name }, { program: {} });
    }),
  };
});

import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';
import {
  applyTiltShiftEffectToGl,
  defaultGlTiltShiftEffectRunner,
  registerGlTiltShiftEffect,
} from './glTiltShiftEffect';

// Deliberately OFF-CENTRE. `abs` is symmetric about 0.5, so a band at 0.5 is its own mirror and cannot
// tell the two vertical origins apart — the same reason the functional scene uses an off-centre value.
const BAND_CENTER = 0.25;

function apply(effect: Readonly<Partial<TiltShiftEffect>> = {}): void {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform2f.mockClear();
  const target = { height: 64, texture: {}, width: 64 } as unknown as GlRenderTarget;
  applyTiltShiftEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, {
    kind: 'TiltShiftEffect',
    ...effect,
  } as TiltShiftEffect);
}

function distanceExpression(): string {
  apply();
  const source = programMock.getGlEffectProgram.mock.calls[0]![2] as string;
  return extractGlslExpression(source, /float dist = ([^;]+);/);
}

function distanceAtTexcoordY(texcoordY: number, center = BAND_CENTER): number {
  return evaluateGlslScalarExpression(distanceExpression(), { u_center: center, 'v_texCoord.y': texcoordY });
}

function scalarUniform(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyTiltShiftEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. The band distance was measured as
  // `abs(v_texCoord.y - u_center)`, which on a bottom-left-origin render target counts the row up from
  // the BOTTOM — so a band an author placed a quarter of the way down the frame came out a quarter of
  // the way UP it, and the sharp strip and the two blurred strips swapped ends. `center` is a `number`
  // under either reading; a band at 0.5 is its own mirror; and a mirror comparison of the two backends
  // sees a sharp band in both frames. Nothing but the row it lands on distinguishes them.
  //
  // jsdom compiles no GLSL, so the shipped expression is evaluated arithmetically rather than rendered.
  // That is narrower than a render — nothing here exercises the seven taps or the smoothstep ramp — but
  // it is a claim about where the band's fixed point falls, which is the property that was wrong.
  //
  // MEASURED against the defect, by restoring 6098bea01^'s exact line into the shader — 3 of 8 failed:
  //   AssertionError: expected 0.5 to be close to +0, received difference is 0.5
  //   AssertionError: expected +0 to be close to 0.5, received difference is 0.5
  //   AssertionError: expected 0.6 to be close to 0.1, received difference is 0.5
  it('puts the sharp band at center measured DOWN the image', () => {
    // A band 0.25 down from the top is 0.75 up from the bottom, and that is where distance goes to zero.
    expect(distanceAtTexcoordY(1 - BAND_CENTER)).toBeCloseTo(0, 6);
  });

  it('does not put the band at the mirrored row', () => {
    expect(distanceAtTexcoordY(BAND_CENTER)).toBeCloseTo(0.5, 6);
  });

  it('grows the distance either side of the band, so the ramp is symmetric about it', () => {
    const above = distanceAtTexcoordY(1 - BAND_CENTER + 0.1);
    const below = distanceAtTexcoordY(1 - BAND_CENTER - 0.1);

    expect(above).toBeCloseTo(0.1, 6);
    expect(below).toBeCloseTo(0.1, 6);
  });

  // The control that pins the reading rather than a coincidence: at a centred band the two vertical
  // origins agree exactly, which is why this value can never be the one a scene tests with.
  it('cannot distinguish the two origins at a centred band', () => {
    expect(distanceAtTexcoordY(0.3, 0.5)).toBeCloseTo(distanceAtTexcoordY(0.7, 0.5), 10);
  });

  it('passes the band geometry through as descriptor defaults', () => {
    apply();

    expect(scalarUniform('u_center')).toBe(0.5);
    expect(scalarUniform('u_width')).toBe(0.3);
    expect(scalarUniform('u_blur')).toBe(4);
  });

  // The blur taps step by texels, so the shader needs the source's pixel dimensions — a band measured in
  // normalised rows still has to be blurred in pixels.
  it('gives the shader the source resolution the taps are scaled by', () => {
    apply();

    const call = glMock.uniform2f.mock.calls.find((entry) => entry[0] === 'u_resolution')!;
    expect(call.slice(1)).toEqual([64, 64]);
  });
});

describe('defaultGlTiltShiftEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    glMock.uniform1f.mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlTiltShiftEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { center: 0.2, kind: 'TiltShiftEffect' } as TiltShiftEffect,
    );

    expect(scalarUniform('u_center')).toBe(0.2);
  });
});

describe('registerGlTiltShiftEffect', () => {
  it('makes the runner resolvable for the TiltShiftEffect kind', () => {
    const state = createGlRenderState(document.createElement('canvas'));

    expect(getGlRenderEffectRunner(state, 'TiltShiftEffect')).toBeNull();
    registerGlTiltShiftEffect(state);
    expect(getGlRenderEffectRunner(state, 'TiltShiftEffect')).toBe(defaultGlTiltShiftEffectRunner);
  });
});
