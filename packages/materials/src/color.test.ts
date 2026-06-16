import { computeRGBHexString } from './color';

describe('computeRGBHexString', () => {
  it('returns a 6-digit hex string of the lower 24 bits', () => {
    expect(computeRGBHexString(0x00ff0000)).toBe('#ff0000');
    expect(computeRGBHexString(0x0000ff00)).toBe('#00ff00');
    expect(computeRGBHexString(0x000000ff)).toBe('#0000ff');
    expect(computeRGBHexString(0x00000000)).toBe('#000000');
    expect(computeRGBHexString(0x00ffffff)).toBe('#ffffff');
  });
});
