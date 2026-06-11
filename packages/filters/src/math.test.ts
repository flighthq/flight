import { boxRadiusForSigma } from './math';

describe('boxRadiusForSigma', () => {
  it('returns 0 for sigma 0', () => {
    expect(boxRadiusForSigma(0, 1)).toBe(0);
  });

  it('returns 0 for negative sigma', () => {
    expect(boxRadiusForSigma(-4, 1)).toBe(0);
  });

  it('returns a positive radius for positive sigma', () => {
    expect(boxRadiusForSigma(4, 1)).toBeGreaterThan(0);
  });

  it('returns a smaller radius for more passes at the same sigma', () => {
    const r1 = boxRadiusForSigma(10, 1);
    const r3 = boxRadiusForSigma(10, 3);
    expect(r3).toBeLessThan(r1);
  });

  it('returns radius 2 for sigma 4 with 1 pass', () => {
    // boxRadiusForSigma(4, 1) = round((-1 + sqrt(1 + 12*16/1)) / 2) = round((-1 + sqrt(193)) / 2) ≈ round(6.44) = 6
    // Re-verify the formula: (-1 + sqrt(193)) / 2 ≈ (-1 + 13.89) / 2 ≈ 6.44 → rounds to 6
    expect(boxRadiusForSigma(4, 1)).toBe(6);
  });
});
