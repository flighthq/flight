import { getBlurDownsampleLevel, getBlurResidualSigma } from './blurDownsample';

describe('getBlurDownsampleLevel', () => {
  it('stays at full resolution at or below the max sigma threshold', () => {
    expect(getBlurDownsampleLevel(1)).toBe(0);
    expect(getBlurDownsampleLevel(2)).toBe(0);
    expect(getBlurDownsampleLevel(4)).toBe(0);
  });

  it('adds one level per doubling of sigma past the threshold', () => {
    expect(getBlurDownsampleLevel(8)).toBe(1);
    expect(getBlurDownsampleLevel(16)).toBe(2);
    expect(getBlurDownsampleLevel(32)).toBe(3);
  });

  it('rounds a partial doubling up to the next level', () => {
    // sigma 5 → log2(5/4) ≈ 0.32 → ceil → level 1.
    expect(getBlurDownsampleLevel(5)).toBe(1);
  });

  it('returns 0 for non-positive sigma', () => {
    expect(getBlurDownsampleLevel(0)).toBe(0);
    expect(getBlurDownsampleLevel(-4)).toBe(0);
  });

  it('never leaves a residual sigma above the threshold', () => {
    for (const sigma of [4, 5, 8, 13, 16, 40, 100]) {
      const level = getBlurDownsampleLevel(sigma);
      expect(getBlurResidualSigma(sigma, level)).toBeLessThanOrEqual(4);
    }
  });
});

describe('getBlurResidualSigma', () => {
  it('divides sigma by 2^level', () => {
    expect(getBlurResidualSigma(8, 1)).toBe(4);
    expect(getBlurResidualSigma(16, 2)).toBe(4);
    expect(getBlurResidualSigma(4, 0)).toBe(4);
    expect(getBlurResidualSigma(32, 3)).toBe(4);
  });

  it('returns 0 for non-positive sigma', () => {
    expect(getBlurResidualSigma(0, 2)).toBe(0);
    expect(getBlurResidualSigma(-8, 1)).toBe(0);
  });
});
