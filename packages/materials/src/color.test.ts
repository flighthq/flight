import { computeRgbHexString, createLinearColor, unpackColorToLinear } from './color';

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
