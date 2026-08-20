import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));
const glMock = vi.hoisted(() => ({ uniform1fv: vi.fn((_location: unknown, _value: Float32Array) => {}) }));

vi.mock('./glEffectProgramCache', () => programMock);

vi.mock('@flighthq/render-gl/contract', () => ({
  drawGlFullscreenPass: vi.fn((_state, _program, _textures, _dest, setUniforms) => {
    setUniforms({ ...glMock, getUniformLocation: (_p: unknown, name: string) => name }, { program: {} });
  }),
}));

import { applyColorMatrixPassToGl } from './glColorMatrixPass';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

function apply(matrix: ReadonlyArray<number>): void {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1fv.mockClear();
  const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;
  applyColorMatrixPassToGl({ gl: {} } as unknown as GlRenderState, target, target, matrix);
}

function uploadedMatrix(matrix: ReadonlyArray<number>): Float32Array {
  apply(matrix);
  const call = glMock.uniform1fv.mock.calls.find((entry) => entry[0] === 'u_colorMatrix');
  if (call === undefined) throw new Error('no uniform1fv call for u_colorMatrix');
  return call[1] as Float32Array;
}

function channelExpression(channel: 'nr' | 'ng' | 'nb' | 'na'): string {
  apply(IDENTITY);
  const source = programMock.getGlEffectProgram.mock.calls[0]![2] as string;
  return extractGlslExpression(source, new RegExp(`float ${channel} = ([^;]+);`));
}

// Evaluates one output channel of the SHIPPED shader for a given matrix and input colour, which is what
// makes "row-major, RGBA then bias" a claim about arithmetic rather than about a spelling.
function channelValue(
  channel: 'nr' | 'ng' | 'nb' | 'na',
  matrix: ReadonlyArray<number>,
  colour: Readonly<{ a: number; b: number; g: number; r: number }>,
): number {
  const bindings: Record<string, number> = { ...colour };
  for (let index = 0; index < 20; index++) bindings[`u_colorMatrix[${index}]`] = matrix[index] ?? 0;
  return evaluateGlslScalarExpression(channelExpression(channel), bindings);
}

describe('applyColorMatrixPassToGl', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. It is the SINGLE realization for the whole
  // matrix-tier Adjustment family: a run of consecutive matrix adjustments fuses to one 4×5 matrix and
  // runs through this pass. Invert, grayscale, sepia, saturation, hue rotate, scale/bias — every one of
  // them is this shader with different numbers, so a layout error here is wrong colour everywhere at
  // once, and it always produces a plausible colour rather than an error.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored — its
  // history holds only the feature commit, an API rename and the lane refactor. Branch-2 shape.
  it('uploads exactly twenty coefficients', () => {
    expect(uploadedMatrix(IDENTITY)).toHaveLength(20);
  });

  // ★ CONSTRUCTED CASE: the layout is ROW-MAJOR — indices 0..4 are the red output's row. Transposed, the
  // matrix would still be twenty finite numbers and still render a picture; only which input channel
  // feeds which output would change. This asks the shipped expression directly.
  // MEASURED by reading the red row column-major (indices 0, 5, 10, 15) — 2 of 8 failed:
  //   AssertionError: expected +0 to be close to 0.75, received difference is 0.75
  //   AssertionError: expected +0 to be close to 0.5, received difference is 0.5
  it('reads row-major, so indices 0 to 4 are the red output row', () => {
    // A matrix whose red row takes GREEN only: red out must follow green in, and nothing else.
    const greenIntoRed = [0, 1, 0, 0, 0, ...ZEROS_15];

    expect(channelValue('nr', greenIntoRed, { a: 1, b: 0.25, g: 0.75, r: 0.1 })).toBeCloseTo(0.75, 6);
  });

  it('gives each output channel its own row, five apart', () => {
    // Green row (5..9) takes BLUE, blue row (10..14) takes RED, alpha row (15..19) takes ALPHA.
    const rotated = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    const colour = { a: 0.5, b: 0.25, g: 0.75, r: 0.1 };

    expect(channelValue('ng', rotated, colour)).toBeCloseTo(0.25, 6);
    expect(channelValue('nb', rotated, colour)).toBeCloseTo(0.1, 6);
    expect(channelValue('na', rotated, colour)).toBeCloseTo(0.5, 6);
  });

  // The fourth column is the ALPHA coefficient and the fifth is the BIAS — the classic off-by-one in a
  // 4×5 matrix, and one that looks like a slight tint rather than a fault.
  // MEASURED by swapping indices 3 and 4 in the red row — 1 of 8 failed, the predicted one and only it:
  //   AssertionError: expected 1 to be close to 0.5, received difference is 0.5
  it('multiplies column four by alpha and adds column five unmultiplied', () => {
    const alphaOnly = [0, 0, 0, 1, 0, ...ZEROS_15];
    const biasOnly = [0, 0, 0, 0, 0.3, ...ZEROS_15];
    const colour = { a: 0.5, b: 0, g: 0, r: 0 };

    expect(channelValue('nr', alphaOnly, colour)).toBeCloseTo(0.5, 6);
    // The bias does not scale with alpha, which is what makes it a bias.
    expect(channelValue('nr', biasOnly, colour)).toBeCloseTo(0.3, 6);
    expect(channelValue('nr', biasOnly, { a: 1, b: 0, g: 0, r: 0 })).toBeCloseTo(0.3, 6);
  });

  it('leaves an identity matrix colour untouched', () => {
    const colour = { a: 0.5, b: 0.75, g: 0.25, r: 0.1 };

    expect(channelValue('nr', IDENTITY, colour)).toBeCloseTo(0.1, 6);
    expect(channelValue('ng', IDENTITY, colour)).toBeCloseTo(0.25, 6);
    expect(channelValue('nb', IDENTITY, colour)).toBeCloseTo(0.75, 6);
    expect(channelValue('na', IDENTITY, colour)).toBeCloseTo(0.5, 6);
  });

  // A short matrix zero-fills rather than reading past the end. A caller handing over a 4×4 (16 entries)
  // is the realistic mistake, and the missing bias column must read as zero, not as whatever was there.
  it('zero-fills a matrix shorter than twenty', () => {
    const uploaded = uploadedMatrix([1, 0, 0, 0]);

    expect(uploaded[4]).toBe(0);
    expect(uploaded[19]).toBe(0);
    expect(uploaded).toHaveLength(20);
  });

  it('ignores coefficients past the twentieth', () => {
    expect([...uploadedMatrix([...IDENTITY, 99, 98])]).toEqual([...IDENTITY]);
  });

  it('compiles one program for every matrix, since the coefficients are a uniform', () => {
    apply(IDENTITY);
    const first = programMock.getGlEffectProgram.mock.calls[0]![1];
    apply([2, 0, 0, 0, 0, ...ZEROS_15]);

    expect(programMock.getGlEffectProgram.mock.calls[0]![1]).toBe(first);
    expect(first).toBe('adjustment.colorMatrix');
  });
});

const ZEROS_15 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
