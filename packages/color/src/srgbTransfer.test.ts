import { linearChannelToSrgb, srgbChannelToLinear } from './srgbTransfer';

describe('linearChannelToSrgb', () => {
  it('maps 0 → 0', () => {
    expect(linearChannelToSrgb(0)).toBe(0);
  });
  it('maps 1 → 1', () => {
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 8);
  });
  it('is the inverse of the sRGB decode for a round-trip', () => {
    const linear = 0.5;
    const srgb = linearChannelToSrgb(linear);
    expect(srgbChannelToLinear(srgb)).toBeCloseTo(linear, 8);
  });
});

describe('srgbChannelToLinear', () => {
  it('maps 0 → 0 and 1 → 1', () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBeCloseTo(1, 8);
  });
  it('decodes mid sRGB below the linear midpoint', () => {
    // 0x80/0xff ≈ 0.502 sRGB → linear ≈ 0.21586.
    expect(srgbChannelToLinear(0x80 / 0xff)).toBeCloseTo(0.21586, 5);
  });
  it('round-trips with linearChannelToSrgb', () => {
    const srgb = 0.25;
    expect(linearChannelToSrgb(srgbChannelToLinear(srgb))).toBeCloseTo(srgb, 8);
  });
});
