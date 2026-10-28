// Generated from crates/flight-color/tests/premultiply_color_alpha_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { premultiplyColorAlpha, unpremultiplyColorAlpha } from './contract.ts';

describe('premultiplyColorAlpha', () => {
  it('returns fully opaque color unchanged', () => {
    expect(premultiplyColorAlpha(4278190335)).toEqual(4278190335);
  });
  it('multiplies rgb by alpha and preserves the alpha channel', () => {
    const result = premultiplyColorAlpha(4278190207);
    const r = (result >> 24) & 255;
    expect(Math.abs((r | 0) - 127) <= 5, `expected red near 0x7f, got 0x${r.toString(16).padStart(2, '0')}`).toBe(true);
    expect(result & 255).toEqual(127);
  });
  it('returns black with alpha 0 for fully transparent color', () => {
    const result = premultiplyColorAlpha(4278190080);
    expect(result & 255).toEqual(0);
    expect((result >> 24) & 255).toEqual(0);
  });
  it('round trips with unpremultiply color alpha for fully opaque', () => {
    const color: number = 2872334079;
    expect(unpremultiplyColorAlpha(premultiplyColorAlpha(color))).toEqual(color);
  });
});

describe('unpremultiplyColorAlpha', () => {
  it('returns fully opaque color unchanged', () => {
    expect(unpremultiplyColorAlpha(4278190335)).toEqual(4278190335);
  });
  it('divides rgb by alpha and preserves the alpha channel', () => {
    const premul = premultiplyColorAlpha((4278190335 & 4294967168) | 128);
    const result = unpremultiplyColorAlpha(premul);
    expect(result & 255).toEqual(128);
  });
  it('returns the input unchanged for alpha 0', () => {
    const color: number = 4278190080;
    expect(unpremultiplyColorAlpha(color)).toEqual(color);
  });
});
