import {
  computeRgbHexString,
  createLinearColor,
  packColor,
  packLinearToColor,
  packOpaqueColor,
  unpackColorRgba,
  unpackColorToLinear,
} from './packColor';

describe('computeRgbHexString', () => {
  it('returns a 6-digit hex string of the lower 24 bits', () => {
    expect(computeRgbHexString(0x00ff0000)).toBe('#ff0000');
    expect(computeRgbHexString(0x0000ff00)).toBe('#00ff00');
    expect(computeRgbHexString(0x000000ff)).toBe('#0000ff');
    expect(computeRgbHexString(0x00000000)).toBe('#000000');
    expect(computeRgbHexString(0x00ffffff)).toBe('#ffffff');
  });
});

describe('createLinearColor', () => {
  it('allocates a zeroed four-component color', () => {
    expect(createLinearColor()).toEqual([0, 0, 0, 0]);
  });
});

describe('packColor', () => {
  it('packs white components to 0xffffffff', () => {
    expect(packColor(1, 1, 1, 1)).toBe(0xffffffff);
  });
  it('packs black components to 0x000000ff', () => {
    expect(packColor(0, 0, 0, 1)).toBe(0x000000ff);
  });
  it('clamps out-of-range values', () => {
    expect(packColor(2, -1, 0.5, 1)).toBe(packColor(1, 0, 0.5, 1));
  });
});

describe('packLinearToColor', () => {
  it('is the inverse of unpackColorToLinear for white', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0xffffffff);
    expect(packLinearToColor(out)).toBe(0xffffffff);
  });
  it('is the inverse of unpackColorToLinear for black (opaque)', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x000000ff);
    expect(packLinearToColor(out)).toBe(0x000000ff);
  });
  it('passes alpha through without gamma encoding', () => {
    const color = 0x000000_80 >>> 0;
    const out = createLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    expect(repacked & 0xff).toBe(0x80);
  });
  it('round-trips a mid-gray color within 1 LSB', () => {
    const color = 0x808080ff >>> 0;
    const out = createLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    const origR = (color >>> 24) & 0xff;
    const repR = (repacked >>> 24) & 0xff;
    expect(Math.abs(repR - origR)).toBeLessThanOrEqual(1);
  });
});

describe('packOpaqueColor', () => {
  it('widens 24-bit RGB to 32-bit RGBA with full opacity', () => {
    expect(packOpaqueColor(0x336699)).toBe(0x336699ff);
    expect(packOpaqueColor(0x000000)).toBe(0x000000ff);
    expect(packOpaqueColor(0xffffff)).toBe(0xffffffff);
  });

  it('masks off bits above 24 (ignores any alpha in the input)', () => {
    expect(packOpaqueColor(0xaa336699)).toBe(0x336699ff);
  });

  it('returns an unsigned 32-bit integer', () => {
    expect(packOpaqueColor(0xffffff)).toBeGreaterThan(0);
  });
});

describe('unpackColorRgba', () => {
  it('extracts white as all-ones', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    unpackColorRgba(out, 0xffffffff);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
    expect(out[3]).toBeCloseTo(1, 5);
  });
  it('does NOT gamma-decode — mid sRGB stays above the linear midpoint', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    unpackColorRgba(out, 0x808080ff);
    expect(out[0]).toBeCloseTo(0x80 / 0xff, 4);
  });
});

describe('unpackColorToLinear', () => {
  it('decodes white and black exactly at the endpoints', () => {
    const out = createLinearColor();
    expect(unpackColorToLinear(out, 0xffffffff)).toEqual([1, 1, 1, 1]);
    expect(unpackColorToLinear(out, 0x000000ff)).toEqual([0, 0, 0, 1]);
  });

  it('passes alpha through linearly without gamma decode', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x00000080);
    expect(out[3]).toBeCloseTo(0x80 / 0xff, 6);
  });

  it('gamma-decodes RGB so mid sRgb is below the linear midpoint', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x808080ff);
    expect(out[0]).toBeCloseTo(0.21586, 4);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it('returns the same out instance it was given', () => {
    const out = createLinearColor();
    expect(unpackColorToLinear(out, 0xff0000ff)).toBe(out);
  });
});
