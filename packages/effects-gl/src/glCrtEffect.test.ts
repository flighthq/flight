import { createGlRenderState } from '@flighthq/render-gl/contract';
import type { CrtEffect, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

// The shader is a module-private string, so it is read back from the argument the effect hands the
// program cache — the exact text that would be compiled — rather than exported for the test's benefit.
const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));

vi.mock('./glEffectProgramCache', () => programMock);

// Partial, not wholesale: `createGlRenderState` and the runtime accessor the registry reaches through
// must stay real, or the registration test below would be asserting against a mock of itself.
vi.mock('@flighthq/render-gl/contract', async () => {
  const actual = (await vi.importActual('@flighthq/render-gl/contract')) as Record<string, unknown>;
  return { ...actual, drawGlFullscreenPass: vi.fn() };
});

import { applyCrtEffectToGl, defaultGlCrtEffectRunner, registerGlCrtEffect } from './glCrtEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

// The scanline pattern is periodic in the row, so a phase read at one texcoord is the whole claim: at
// half a scanline DOWN FROM THE TOP the sine is at its positive peak and the line is at full brightness.
// 10 rows keeps the arithmetic exact — 0.05 of the frame is half a scanline.
const RESOLUTION_ROWS = 10;
const HALF_SCANLINE_BELOW_TOP = 1 - 0.5 / RESOLUTION_ROWS;

function scanlineExpression(): string {
  programMock.getGlEffectProgram.mockClear();
  const target = { height: RESOLUTION_ROWS, texture: {}, width: 4 } as unknown as GlRenderTarget;
  applyCrtEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, { kind: 'CrtEffect' } as CrtEffect);
  const source = programMock.getGlEffectProgram.mock.calls[0]![2] as string;
  return extractGlslExpression(source, /float line = ([^;]+);/);
}

describe('applyCrtEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. The shader read `sin(uv.y * u_resolution.y * PI)`,
  // numbering scanlines up from the bottom on a bottom-left-origin render target while WebGPU numbered
  // them down from the top — the same authored line landing on different rows per backend. Nothing in
  // the type system can see it and, because the pattern is a dense stripe, a mirror comparison of the
  // two frames does not see it either: both are striped.
  //
  // jsdom compiles no GLSL, so the shipped expression is evaluated arithmetically instead of rendered.
  // That is narrower than a render — it says nothing about sampling, aberration, or the vignette — but
  // it is a claim about the value the shader computes, not about how the line is spelled.
  //
  // MEASURED against the defect, by restoring f8f77c15f^'s exact line into the shader — 3 of 5 failed:
  //   expected 2.7755575615628914e-16 to be close to 1, received difference is 0.9999999999999998
  //   expected 1 to be close to +0, received difference is 1
  //   expected 0.7000000000000001 to be close to 1, received difference is 0.29999999999999993
  it('puts the first scanline peak half a line below the TOP of the image', () => {
    const value = evaluateGlslScalarExpression(scanlineExpression(), {
      'u_resolution.y': RESOLUTION_ROWS,
      'uv.y': HALF_SCANLINE_BELOW_TOP,
    });

    // Counted from the bottom instead, this same texcoord lands on a trough and reads 0.
    expect(value).toBeCloseTo(1, 6);
  });

  it('puts a trough half a line below the BOTTOM of the image, so the pattern is anchored to one edge', () => {
    const value = evaluateGlslScalarExpression(scanlineExpression(), {
      'u_resolution.y': RESOLUTION_ROWS,
      'uv.y': 0.5 / RESOLUTION_ROWS,
    });

    expect(value).toBeCloseTo(0, 6);
  });

  it('darkens a trough row and leaves a peak row alone, scaled by scanlineIntensity', () => {
    const expression = scanlineExpression();
    const peak = evaluateGlslScalarExpression(expression, {
      'u_resolution.y': RESOLUTION_ROWS,
      'uv.y': HALF_SCANLINE_BELOW_TOP,
    });
    const trough = evaluateGlslScalarExpression(expression, {
      'u_resolution.y': RESOLUTION_ROWS,
      'uv.y': 0.5 / RESOLUTION_ROWS,
    });

    // `col *= 1.0 - u_scanlineIntensity * (1.0 - line)`: the peak is untouched and the trough takes the
    // full intensity, which is what makes the phase above a visible difference rather than a shift.
    expect(1 - 0.3 * (1 - peak)).toBeCloseTo(1, 6);
    expect(1 - 0.3 * (1 - trough)).toBeCloseTo(0.7, 6);
  });
});

describe('defaultGlCrtEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    programMock.getGlEffectProgram.mockClear();
    const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;

    defaultGlCrtEffectRunner(
      { dest: target, pool: { free: [], inUse: [] }, source: target, state: { gl: {} } } as never,
      { kind: 'CrtEffect' } as CrtEffect,
    );

    expect(programMock.getGlEffectProgram.mock.calls[0]![1]).toBe('stylization.crt');
  });
});

describe('registerGlCrtEffect', () => {
  it('makes the runner resolvable for the CrtEffect kind', () => {
    const canvas = document.createElement('canvas');
    const state = createGlRenderState(canvas);

    expect(getGlRenderEffectRunner(state, 'CrtEffect')).toBeNull();
    registerGlCrtEffect(state);
    expect(getGlRenderEffectRunner(state, 'CrtEffect')).toBe(defaultGlCrtEffectRunner);
  });
});
