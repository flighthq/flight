import { computeBoxBlurPassRadius, computeBoxBlurRadius } from './blurMath';

describe('computeBoxBlurPassRadius', () => {
  // Combined variance of n box passes of radius rᵢ is Σ (rᵢ² + rᵢ) / 3; the effective σ is its
  // square root. These assert the construction tracks the target σ rather than overshooting.
  const effectiveSigma = (radii: ReadonlyArray<number>): number =>
    Math.sqrt(radii.reduce((sum, r) => sum + (r * r + r) / 3, 0));

  const passRadii = (sigma: number, passes: number): number[] =>
    Array.from({ length: passes }, (_unused, pass) => computeBoxBlurPassRadius(sigma, passes, pass));

  it('returns 0 for every pass when sigma is 0', () => {
    expect(passRadii(0, 3)).toEqual([0, 0, 0]);
  });

  it('returns 0 for every pass when sigma is negative', () => {
    expect(passRadii(-1, 2)).toEqual([0, 0]);
  });

  it('uses at most two distinct box sizes', () => {
    expect(new Set(passRadii(12, 3)).size).toBeLessThanOrEqual(2);
  });

  it('is non-decreasing in pass index', () => {
    const radii = passRadii(4, 3);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1]);
    }
  });

  it('approximates the target sigma within a few percent without overshooting', () => {
    for (const sigma of [4, 8, 12]) {
      const sigmaEff = effectiveSigma(passRadii(sigma, 3));
      expect(sigmaEff).toBeGreaterThan(sigma * 0.9);
      expect(sigmaEff).toBeLessThanOrEqual(sigma * 1.02);
    }
  });

  it('does not overshoot the way a single repeated rounded radius does', () => {
    // The uniform approach rounds 3.53 up to 4 → σ_eff ≈ 4.47 for σ=4, n=3.
    const naiveRadius = computeBoxBlurRadius(4, 3);
    const naiveSigma = effectiveSigma([naiveRadius, naiveRadius, naiveRadius]);
    const splitSigma = effectiveSigma(passRadii(4, 3));
    expect(naiveSigma).toBeGreaterThan(4); // documents the overshoot
    expect(Math.abs(splitSigma - 4)).toBeLessThan(Math.abs(naiveSigma - 4));
  });
});

describe('computeBoxBlurRadius', () => {
  it('returns 0 for sigma 0', () => {
    expect(computeBoxBlurRadius(0, 1)).toBe(0);
  });

  it('returns 0 for negative sigma', () => {
    expect(computeBoxBlurRadius(-4, 1)).toBe(0);
  });

  it('returns a positive radius for positive sigma', () => {
    expect(computeBoxBlurRadius(4, 1)).toBeGreaterThan(0);
  });

  it('returns a smaller radius for more passes at the same sigma', () => {
    const r1 = computeBoxBlurRadius(10, 1);
    const r3 = computeBoxBlurRadius(10, 3);
    expect(r3).toBeLessThan(r1);
  });

  it('returns radius 6 for sigma 4 with 1 pass', () => {
    // round((-1 + sqrt(1 + 12·16/1)) / 2) = round((-1 + sqrt(193)) / 2) ≈ round(6.44) = 6
    expect(computeBoxBlurRadius(4, 1)).toBe(6);
  });
});
