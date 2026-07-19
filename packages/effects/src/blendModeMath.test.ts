import { AdvancedBlendMode } from '@flighthq/types';

import {
  blendNonSeparableRgb,
  getAdvancedBlendRgb,
  getSeparableBlendChannel,
  isNonSeparableBlendMode,
} from './blendModeMath';

const LUM = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;
const SAT = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b);

describe('blendNonSeparableRgb', () => {
  it('Luminosity replaces backdrop luma with source luma, preserving backdrop hue/sat', () => {
    const out: [number, number, number] = [0, 0, 0];
    const cb: [number, number, number] = [0.8, 0.2, 0.4];
    const cs: [number, number, number] = [0.5, 0.5, 0.5];
    blendNonSeparableRgb(AdvancedBlendMode.Luminosity, cb[0], cb[1], cb[2], cs[0], cs[1], cs[2], out);
    // Result luma equals the source's luma.
    expect(LUM(out[0], out[1], out[2])).toBeCloseTo(LUM(cs[0], cs[1], cs[2]), 5);
    // Backdrop saturation is preserved (chroma range unchanged) since no channel clipped.
    expect(SAT(out[0], out[1], out[2])).toBeCloseTo(SAT(cb[0], cb[1], cb[2]), 5);
  });

  it('Color takes source hue+sat with backdrop luma', () => {
    const out: [number, number, number] = [0, 0, 0];
    const cb: [number, number, number] = [0.2, 0.2, 0.2]; // gray backdrop, luma 0.2
    const cs: [number, number, number] = [0.9, 0.1, 0.1];
    blendNonSeparableRgb(AdvancedBlendMode.Color, cb[0], cb[1], cb[2], cs[0], cs[1], cs[2], out);
    expect(LUM(out[0], out[1], out[2])).toBeCloseTo(LUM(cb[0], cb[1], cb[2]), 5);
  });

  it('Hue takes source hue, backdrop sat and luma', () => {
    const out: [number, number, number] = [0, 0, 0];
    const cb: [number, number, number] = [0.4, 0.5, 0.6];
    const cs: [number, number, number] = [0.9, 0.2, 0.2];
    blendNonSeparableRgb(AdvancedBlendMode.Hue, cb[0], cb[1], cb[2], cs[0], cs[1], cs[2], out);
    expect(LUM(out[0], out[1], out[2])).toBeCloseTo(LUM(cb[0], cb[1], cb[2]), 5);
    expect(SAT(out[0], out[1], out[2])).toBeCloseTo(SAT(cb[0], cb[1], cb[2]), 5);
  });

  it('Saturation takes source sat, backdrop hue and luma', () => {
    const out: [number, number, number] = [0, 0, 0];
    const cb: [number, number, number] = [0.4, 0.5, 0.6];
    const cs: [number, number, number] = [0.9, 0.2, 0.2]; // sat 0.7
    blendNonSeparableRgb(AdvancedBlendMode.Saturation, cb[0], cb[1], cb[2], cs[0], cs[1], cs[2], out);
    expect(SAT(out[0], out[1], out[2])).toBeCloseTo(SAT(cs[0], cs[1], cs[2]), 5);
    expect(LUM(out[0], out[1], out[2])).toBeCloseTo(LUM(cb[0], cb[1], cb[2]), 5);
  });

  it('keeps every channel in 0..1 after gamut clipping', () => {
    const out: [number, number, number] = [0, 0, 0];
    blendNonSeparableRgb(AdvancedBlendMode.Color, 0.95, 0.95, 0.95, 1, 0, 0, out);
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('falls through to the source triple for an unknown mode', () => {
    const out: [number, number, number] = [0, 0, 0];
    blendNonSeparableRgb('acme.Nope', 0.1, 0.2, 0.3, 0.7, 0.8, 0.9, out);
    expect(out).toEqual([0.7, 0.8, 0.9]);
  });
});

describe('getAdvancedBlendRgb', () => {
  it('routes separable modes through the per-channel path', () => {
    const out: [number, number, number] = [0, 0, 0];
    getAdvancedBlendRgb(AdvancedBlendMode.Multiply as never, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, out);
    // Multiply is not an AdvancedBlendMode, so it falls through to Normal (source) per channel.
    expect(out).toEqual([0.5, 0.5, 0.5]);
  });

  it('computes Difference per channel', () => {
    const out: [number, number, number] = [0, 0, 0];
    getAdvancedBlendRgb(AdvancedBlendMode.Difference, 0.8, 0.5, 0.2, 0.3, 0.5, 0.9, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0.7, 5);
  });

  it('routes HSL modes through the non-separable path', () => {
    const out: [number, number, number] = [0, 0, 0];
    getAdvancedBlendRgb(AdvancedBlendMode.Luminosity, 0.8, 0.2, 0.4, 0.5, 0.5, 0.5, out);
    expect(LUM(out[0], out[1], out[2])).toBeCloseTo(0.5, 5);
  });
});

describe('getSeparableBlendChannel', () => {
  it('Overlay equals HardLight with operands swapped', () => {
    const cb = 0.6;
    const cs = 0.3;
    expect(getSeparableBlendChannel(AdvancedBlendMode.Overlay, cb, cs)).toBeCloseTo(
      getSeparableBlendChannel(AdvancedBlendMode.HardLight, cs, cb),
      6,
    );
  });

  it('Difference is the absolute channel distance', () => {
    expect(getSeparableBlendChannel(AdvancedBlendMode.Difference, 0.8, 0.3)).toBeCloseTo(0.5, 6);
  });

  it('Exclusion(x, 0.5) collapses to 0.5 regardless of backdrop', () => {
    expect(getSeparableBlendChannel(AdvancedBlendMode.Exclusion, 0.2, 0.5)).toBeCloseTo(0.5, 6);
    expect(getSeparableBlendChannel(AdvancedBlendMode.Exclusion, 0.9, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('ColorDodge clamps to white when source is 1 and stays 0 for a black backdrop', () => {
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorDodge, 0.4, 1)).toBe(1);
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorDodge, 0, 0.5)).toBe(0);
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorDodge, 0.25, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('ColorBurn clamps to black when source is 0 and stays 1 for a white backdrop', () => {
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorBurn, 0.6, 0)).toBe(0);
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorBurn, 1, 0.5)).toBe(1);
    expect(getSeparableBlendChannel(AdvancedBlendMode.ColorBurn, 0.75, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('SoftLight leaves the backdrop unchanged for a mid-gray source', () => {
    expect(getSeparableBlendChannel(AdvancedBlendMode.SoftLight, 0.6, 0.5)).toBeCloseTo(0.6, 6);
  });

  it('HardLight over a 0.5 source is a straight overlay of the backdrop', () => {
    // cs = 0.5 sits on the branch boundary; both branches agree there.
    expect(getSeparableBlendChannel(AdvancedBlendMode.HardLight, 0.4, 0.5)).toBeCloseTo(0.4, 6);
  });

  it('returns the source channel (Normal) for an unknown mode', () => {
    expect(getSeparableBlendChannel('acme.Nope', 0.2, 0.7)).toBe(0.7);
  });
});

describe('isNonSeparableBlendMode', () => {
  it('is true only for the four HSL modes', () => {
    for (const mode of [
      AdvancedBlendMode.Hue,
      AdvancedBlendMode.Saturation,
      AdvancedBlendMode.Color,
      AdvancedBlendMode.Luminosity,
    ]) {
      expect(isNonSeparableBlendMode(mode)).toBe(true);
    }
  });

  it('is false for the separable modes', () => {
    for (const mode of [
      AdvancedBlendMode.Overlay,
      AdvancedBlendMode.HardLight,
      AdvancedBlendMode.SoftLight,
      AdvancedBlendMode.Difference,
      AdvancedBlendMode.Exclusion,
      AdvancedBlendMode.ColorDodge,
      AdvancedBlendMode.ColorBurn,
    ]) {
      expect(isNonSeparableBlendMode(mode)).toBe(false);
    }
  });
});
