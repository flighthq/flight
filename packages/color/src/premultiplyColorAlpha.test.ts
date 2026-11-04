// Generated from crates/flight-color/tests/premultiply_color_alpha_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { premultiplyColorAlpha, unpremultiplyColorAlpha } from './contract.ts';

describe('premultiplyColorAlpha', () => {
  it('returns fully opaque color unchanged', () => {
    expect(premultiplyColorAlpha(0xff0000ff)).toEqual(0xff0000ff);
  });
  it('multiplies rgb by alpha and preserves the alpha channel', () => {
    const result = premultiplyColorAlpha(0xff00007f);
    const r = (result >> 24) & 0xff;
    expect(Math.abs((r | 0) - 0x7f) <= 5, `expected red near 0x7f, got 0x${r.toString(16).padStart(2, '0')}`).toBe(
      true,
    );
    expect(result & 0xff).toEqual(0x7f);
  });
  it('returns black with alpha 0 for fully transparent color', () => {
    const result = premultiplyColorAlpha(0xff000000);
    expect(result & 0xff).toEqual(0);
    expect((result >> 24) & 0xff).toEqual(0);
  });
  it('round trips with unpremultiply color alpha for fully opaque', () => {
    const color: number = 0xab3456ff;
    expect(unpremultiplyColorAlpha(premultiplyColorAlpha(color))).toEqual(color);
  });
});

describe('unpremultiplyColorAlpha', () => {
  it('returns fully opaque color unchanged', () => {
    expect(unpremultiplyColorAlpha(0xff0000ff)).toEqual(0xff0000ff);
  });
  it('divides rgb by alpha and preserves the alpha channel', () => {
    const premul = premultiplyColorAlpha((0xff0000ff & 0xffffff80) | 0x80);
    const result = unpremultiplyColorAlpha(premul);
    expect(result & 0xff).toEqual(0x80);
  });
  it('returns the input unchanged for alpha 0', () => {
    const color: number = 0xff000000;
    expect(unpremultiplyColorAlpha(color)).toEqual(color);
  });
});
