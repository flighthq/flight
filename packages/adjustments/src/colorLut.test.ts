import type { ColorTransformFunction } from '@flighthq/types';

import { bakeColorLut, COLOR_LUT_DEFAULT_SIZE, sampleColorLut } from './colorLut';

describe('bakeColorLut', () => {
  it('bakes an empty stack into an identity LUT', () => {
    const lut = bakeColorLut([], 8);
    expect(lut.size).toBe(8);
    expect(lut.samples).toHaveLength(8 * 8 * 8 * 3);
    const out: [number, number, number] = [0, 0, 0];
    sampleColorLut(lut, out, 0.25, 0.5, 0.75);
    expect(out[0]).toBeCloseTo(0.25, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(0.75, 5);
  });

  it('composes transforms left-to-right and clamps to [0, 1]', () => {
    const invert: ColorTransformFunction = (out, r, g, b) => {
      out[0] = 1 - r;
      out[1] = 1 - g;
      out[2] = 1 - b;
    };
    const brighten: ColorTransformFunction = (out, r, g, b) => {
      out[0] = r + 0.5;
      out[1] = g + 0.5;
      out[2] = b + 0.5;
    };
    const lut = bakeColorLut([invert, brighten], 16);
    const out: [number, number, number] = [0, 0, 0];
    // invert(0.2)=0.8, +0.5 = 1.3 → clamped to 1.
    sampleColorLut(lut, out, 0.2, 0.2, 0.2);
    expect(out[0]).toBeCloseTo(1, 5);
  });

  it('defaults to the standard resolution', () => {
    const lut = bakeColorLut([]);
    expect(lut.size).toBe(COLOR_LUT_DEFAULT_SIZE);
  });
});

describe('sampleColorLut', () => {
  it('interpolates between cells trilinearly', () => {
    const ramp: ColorTransformFunction = (out, r) => {
      out[0] = r;
      out[1] = r;
      out[2] = r;
    };
    const lut = bakeColorLut([ramp], 2);
    const out: [number, number, number] = [0, 0, 0];
    sampleColorLut(lut, out, 0.5, 0, 0);
    expect(out[0]).toBeCloseTo(0.5, 5);
  });

  it('clamps out-of-range inputs to the cube', () => {
    const lut = bakeColorLut([], 4);
    const out: [number, number, number] = [0, 0, 0];
    sampleColorLut(lut, out, 2, -1, 0.5);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0.5, 5);
  });
});
