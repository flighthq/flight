import {
  getColorContrastRatio,
  getColorLuminance,
  getRec2020LuminanceWeights,
  getRec709LuminanceWeights,
} from './luminance';

describe('getColorContrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(getColorContrastRatio(0xffffffff, 0x000000ff)).toBeCloseTo(21, 0);
  });
  it('returns 1 for identical colors', () => {
    expect(getColorContrastRatio(0x808080ff, 0x808080ff)).toBeCloseTo(1, 3);
  });
  it('is symmetric — order of arguments does not matter', () => {
    const ratio1 = getColorContrastRatio(0xffffffff, 0x808080ff);
    const ratio2 = getColorContrastRatio(0x808080ff, 0xffffffff);
    expect(ratio1).toBeCloseTo(ratio2, 8);
  });
});

describe('getColorLuminance', () => {
  it('returns 1 for white', () => {
    expect(getColorLuminance(0xffffffff)).toBeCloseTo(1, 5);
  });
  it('returns 0 for black', () => {
    expect(getColorLuminance(0x000000ff)).toBeCloseTo(0, 5);
  });
  it('ignores the alpha channel', () => {
    expect(getColorLuminance(0xffffffff)).toBe(getColorLuminance(0xffffff00));
  });
  it('matches expected Rec. 709 value for mid-gray sRGB', () => {
    expect(getColorLuminance(0x808080ff)).toBeCloseTo(0.21586, 4);
  });
});

describe('getRec2020LuminanceWeights', () => {
  it('writes the ITU-R BT.2020 weights that sum to 1', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec2020LuminanceWeights(out);
    expect(out).toEqual([0.2627, 0.678, 0.0593]);
    expect(out[0] + out[1] + out[2]).toBeCloseTo(1, 8);
  });
});

describe('getRec709LuminanceWeights', () => {
  it('writes the ITU-R BT.709 weights that sum to 1', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec709LuminanceWeights(out);
    expect(out).toEqual([0.2126, 0.7152, 0.0722]);
    expect(out[0] + out[1] + out[2]).toBeCloseTo(1, 8);
  });
});
