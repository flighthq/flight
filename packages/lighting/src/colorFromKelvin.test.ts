import { createColorFromKelvin } from './colorFromKelvin';

describe('createColorFromKelvin', () => {
  it('returns opaque alpha (0xff) for all temperatures', () => {
    expect(createColorFromKelvin(3000) & 0xff).toBe(0xff);
    expect(createColorFromKelvin(6500) & 0xff).toBe(0xff);
    expect(createColorFromKelvin(10000) & 0xff).toBe(0xff);
  });

  it('returns white (0xffffffff) for D65 daylight (~6500 K)', () => {
    const color = createColorFromKelvin(6500);
    const r = (color >>> 24) & 0xff;
    const g = (color >>> 16) & 0xff;
    const b = (color >>> 8) & 0xff;
    // D65 should be close to neutral white — all channels near 255.
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(240);
    expect(b).toBeGreaterThan(230);
  });

  it('produces warmer (more red, less blue) color for lower temperatures', () => {
    const warm = createColorFromKelvin(2000);
    const cool = createColorFromKelvin(10000);
    const warmR = (warm >>> 24) & 0xff;
    const warmB = (warm >>> 8) & 0xff;
    const coolR = (cool >>> 24) & 0xff;
    const coolB = (cool >>> 8) & 0xff;
    // Warm candlelight should have more red and less blue than cool sky light.
    expect(warmR).toBeGreaterThanOrEqual(coolR);
    expect(warmB).toBeLessThanOrEqual(coolB);
  });

  it('clamps inputs below 1000 K to 1000 K', () => {
    expect(createColorFromKelvin(500)).toBe(createColorFromKelvin(1000));
  });

  it('clamps inputs above 40000 K to 40000 K', () => {
    expect(createColorFromKelvin(50000)).toBe(createColorFromKelvin(40000));
  });

  it('returns a valid packed RGBA integer (unsigned 32-bit)', () => {
    const color = createColorFromKelvin(5500);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffffff);
    // Must be an integer.
    expect(color % 1).toBe(0);
  });
});
