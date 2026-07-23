import { allocateHslColor, hslToRgb, rgbToHsl } from './hslColor';

describe('allocateHslColor', () => {
  it('allocates a zeroed three-component HSL color', () => {
    expect(allocateHslColor()).toEqual([0, 0, 0]);
  });
});

describe('hslToRgb', () => {
  it('produces achromatic RGB for saturation = 0', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(out, 0, 0, 0.5);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(0.5);
  });
  it('round-trips with rgbToHsl for a primary color', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(out, 0, 1, 0.5);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('does not modify out[3] (alpha)', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0.75];
    hslToRgb(out, 120, 1, 0.5);
    expect(out[3]).toBe(0.75);
  });
});

describe('rgbToHsl', () => {
  it('converts pure red to hue=0, s=1, l=0.5', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0xff0000ff);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(0.5, 5);
  });
  it('converts white to hue=0, s=0, l=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0xffffffff);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('converts black to hue=0, s=0, l=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0x000000ff);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('returns the out instance', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(rgbToHsl(out, 0xff0000ff)).toBe(out);
  });
  it('round-trips with hslToRgb within 1 LSB', () => {
    const hsl: [number, number, number] = [0, 0, 0];
    rgbToHsl(hsl, 0x3c8ab5ff);
    const rgb: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(rgb, hsl[0], hsl[1], hsl[2]);
    const repacked =
      (Math.round(rgb[0] * 0xff) << 24) | (Math.round(rgb[1] * 0xff) << 16) | (Math.round(rgb[2] * 0xff) << 8) | 0xff;
    const orig = 0x3c8ab5ff >>> 0;
    expect(Math.abs(((repacked >>> 24) & 0xff) - ((orig >>> 24) & 0xff))).toBeLessThanOrEqual(1);
  });
});
