import { describe, expect, it } from 'vitest';

import {
  createLottieGradientMatrix,
  interpolateLottieGradientOpacity,
  parseLottieGradient,
} from './lottieGradientPaint.ts';

// ★ THIS ENCODING HAD NO DIRECT TEST WHILE IT WAS PRIVATE TO THE DOCUMENT CORE, and it is the one piece of gradient
// handling with two readers — the shape items that read stops and the renderer that draws them. A drift between those
// two would show as a wrong colour, which no structural assertion elsewhere would catch.
describe('createLottieGradientMatrix', () => {
  // The gradient runs from `start` to `end`; the matrix is built from that vector's length and angle, which is why a
  // horizontal and a vertical gradient of the same length differ only in rotation.
  //
  // ★ MEASURED TWICE, ASSUMED WRONG TWICE. I expected `tx`/`ty` to be the start point; they are the start point plus
  // one span in BOTH axes. `createGradientTransformMatrix` takes the box's corner and a width and height, and this
  // call passes twice the span for both — so the box centre, which is where a gradient is anchored, lands one span
  // past the start on each axis. Stated as that relationship rather than as the literals 40 and 50, because the
  // literals would not say why either number is what it is.
  it('anchors the gradient one span past the start point on both axes', () => {
    const start = [10, 20];
    const end = [40, 20];
    const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const matrix = createLottieGradientMatrix(start, end);
    expect(matrix.tx).toBeCloseTo(start[0] + span, 5);
    expect(matrix.ty).toBeCloseTo(start[1] + span, 5);
  });

  // ★ ASSERTED AS A PROPORTION, NOT AS A NUMBER, BECAUSE THE SCALE FACTOR IS GEOMETRY'S CONVENTION AND NOT THIS
  // MODULE'S. My third guess at `a` was `span * 2` and the measured value was 0.0366 — the gradient matrix divides by
  // the twips constant, which is `createGradientTransformMatrix`'s business to define and this module's only to feed
  // correctly. What Lottie promises is that the gradient covers the span, so doubling the span doubles the scale.
  it('scales in proportion to the span', () => {
    const single = createLottieGradientMatrix([0, 0], [10, 0]);
    const double = createLottieGradientMatrix([0, 0], [20, 0]);
    expect(Math.abs(double.a)).toBeCloseTo(Math.abs(single.a) * 2, 5);
    expect(Math.abs(single.a)).toBeGreaterThan(0);
  });

  it('rotates a vertical gradient a quarter turn from a horizontal one of the same span', () => {
    const horizontal = createLottieGradientMatrix([0, 0], [30, 0]);
    const vertical = createLottieGradientMatrix([0, 0], [0, 30]);
    expect(horizontal.b).toBeCloseTo(0, 5);
    expect(vertical.b).not.toBeCloseTo(0, 5);
  });
});

describe('interpolateLottieGradientOpacity', () => {
  const stops = [
    { alpha: 0, offset: 0 },
    { alpha: 1, offset: 0.5 },
    { alpha: 0.25, offset: 1 },
  ];

  it('interpolates linearly between the surrounding stops', () => {
    expect(interpolateLottieGradientOpacity(stops, 0.25)).toBeCloseTo(0.5, 5);
    expect(interpolateLottieGradientOpacity(stops, 0.75)).toBeCloseTo(0.625, 5);
  });

  it('clamps to the end stops rather than extrapolating', () => {
    expect(interpolateLottieGradientOpacity(stops, -1)).toBe(0);
    expect(interpolateLottieGradientOpacity(stops, 2)).toBe(0.25);
  });

  // An opacity track is optional in the format, so an empty list means fully opaque rather than fully transparent.
  it('answers fully opaque when the document carries no opacity stops', () => {
    expect(interpolateLottieGradientOpacity([], 0.5)).toBe(1);
  });

  it('takes the later stop when two share an offset, rather than dividing by zero', () => {
    expect(
      interpolateLottieGradientOpacity(
        [
          { alpha: 0.1, offset: 0.5 },
          { alpha: 0.9, offset: 0.5 },
        ],
        0.5,
      ),
    ).toBe(0.1);
  });
});

describe('parseLottieGradient', () => {
  // ★ THE FORMAT PACKS TWO TRACKS INTO ONE FLAT ARRAY: `count` colour stops of (offset, r, g, b), then optional
  // opacity stops of (offset, alpha). Reading the second track as colour — or missing it — is the mistake this
  // encoding invites, and the alpha assertions below are what would catch it.
  it('reads colour stops and scales them by the layer opacity', () => {
    const { alphas, colors, ratios } = parseLottieGradient([0, 1, 0, 0, 1, 0, 0, 1], 2, 1);
    expect(colors).toHaveLength(2);
    expect(ratios).toEqual([0, 255]);
    expect(alphas).toEqual([1, 1]);
  });

  it('applies the opacity track that follows the colour stops', () => {
    const values = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0.5, 1, 0.25];
    const { alphas } = parseLottieGradient(values, 2, 1);
    expect(alphas[0]).toBeCloseTo(0.5, 5);
    expect(alphas[1]).toBeCloseTo(0.25, 5);
  });

  it('multiplies the layer opacity through', () => {
    const { alphas } = parseLottieGradient([0, 1, 0, 0, 1, 0, 0, 1], 2, 0.5);
    expect(alphas).toEqual([0.5, 0.5]);
  });

  it('clamps offsets outside the unit range', () => {
    const { ratios } = parseLottieGradient([-1, 1, 0, 0, 2, 0, 0, 1], 2, 1);
    expect(ratios).toEqual([0, 255]);
  });
});
