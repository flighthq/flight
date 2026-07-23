import { colorFromKelvin } from './colorFromKelvin';

describe('colorFromKelvin', () => {
  it('returns opaque alpha (0xff) for all temperatures', () => {
    expect(colorFromKelvin(3000) & 0xff).toBe(0xff);
    expect(colorFromKelvin(6500) & 0xff).toBe(0xff);
    expect(colorFromKelvin(10000) & 0xff).toBe(0xff);
  });

  it('returns white (0xffffffff) for D65 daylight (~6500 K)', () => {
    const color = colorFromKelvin(6500);
    const r = (color >>> 24) & 0xff;
    const g = (color >>> 16) & 0xff;
    const b = (color >>> 8) & 0xff;
    // D65 should be close to neutral white — all channels near 255.
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(240);
    expect(b).toBeGreaterThan(230);
  });

  it('produces warmer (more red, less blue) color for lower temperatures', () => {
    const warm = colorFromKelvin(2000);
    const cool = colorFromKelvin(10000);
    const warmR = (warm >>> 24) & 0xff;
    const warmB = (warm >>> 8) & 0xff;
    const coolR = (cool >>> 24) & 0xff;
    const coolB = (cool >>> 8) & 0xff;
    // Warm candlelight should have more red and less blue than cool sky light.
    expect(warmR).toBeGreaterThanOrEqual(coolR);
    expect(warmB).toBeLessThanOrEqual(coolB);
  });

  it('clamps inputs below 1000 K to 1000 K', () => {
    expect(colorFromKelvin(500)).toBe(colorFromKelvin(1000));
  });

  it('clamps inputs above 40000 K to 40000 K', () => {
    expect(colorFromKelvin(50000)).toBe(colorFromKelvin(40000));
  });

  it('returns a valid packed RGBA integer (unsigned 32-bit)', () => {
    const color = colorFromKelvin(5500);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffffff);
    // Must be an integer.
    expect(color % 1).toBe(0);
  });
});
