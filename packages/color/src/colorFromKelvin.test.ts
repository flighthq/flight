// Generated from crates/flight-color/tests/color_from_kelvin_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { colorFromKelvin } from './contract.ts';

describe('colorFromKelvin', () => {
  it('returns opaque alpha for all temperatures', () => {
    expect(colorFromKelvin(3000.0) & 0xff).toEqual(0xff);
    expect(colorFromKelvin(6500.0) & 0xff).toEqual(0xff);
    expect(colorFromKelvin(10000.0) & 0xff).toEqual(0xff);
  });
  it('returns white for d65 daylight 6500k', () => {
    const color = colorFromKelvin(6500.0);
    const r = (color >> 24) & 0xff;
    const g = (color >> 16) & 0xff;
    const b = (color >> 8) & 0xff;
    expect(r > 240, `red channel ${r} should be > 240`).toBe(true);
    expect(g > 240, `green channel ${g} should be > 240`).toBe(true);
    expect(b > 230, `blue channel ${b} should be > 230`).toBe(true);
  });
  it('produces warmer more red less blue color for lower temperatures', () => {
    const warm = colorFromKelvin(2000.0);
    const cool = colorFromKelvin(10000.0);
    const warmR = (warm >> 24) & 0xff;
    const warmB = (warm >> 8) & 0xff;
    const coolR = (cool >> 24) & 0xff;
    const coolB = (cool >> 8) & 0xff;
    expect(warmR >= coolR).toBe(true);
    expect(warmB <= coolB).toBe(true);
  });
  it('clamps inputs below 1000k to 1000k', () => {
    expect(colorFromKelvin(500.0)).toEqual(colorFromKelvin(1000.0));
  });
  it('clamps inputs above 40000k to 40000k', () => {
    expect(colorFromKelvin(50000.0)).toEqual(colorFromKelvin(40000.0));
  });
  it('returns a valid packed rgba integer', () => {
    const color = colorFromKelvin(5500.0);
    expect(color).not.toEqual(0);
  });
});
