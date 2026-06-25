import {
  computeGaussianRadiusFromSigma,
  computeGaussianSigmaFromRadius,
  computeSeparableBlurPassCount,
  createGaussianKernelWeights,
} from './gaussianMath';

describe('computeGaussianRadiusFromSigma', () => {
  it('returns 0 for zero sigma', () => {
    expect(computeGaussianRadiusFromSigma(0)).toBe(0);
  });
  it('returns ceil(3 * sigma)', () => {
    expect(computeGaussianRadiusFromSigma(2)).toBe(6);
    expect(computeGaussianRadiusFromSigma(2.5)).toBe(8);
  });
  it('clamps negative sigma to 0', () => {
    expect(computeGaussianRadiusFromSigma(-1)).toBe(0);
  });
  it('round-trips with computeGaussianSigmaFromRadius', () => {
    const sigma = 2;
    const radius = computeGaussianRadiusFromSigma(sigma);
    // sigma -> radius -> sigma may not be exact due to ceil, but should be close.
    expect(computeGaussianSigmaFromRadius(radius)).toBeCloseTo(sigma, 0);
  });
});

describe('computeGaussianSigmaFromRadius', () => {
  it('returns 0 for zero radius', () => {
    expect(computeGaussianSigmaFromRadius(0)).toBe(0);
  });
  it('returns radius / 3', () => {
    expect(computeGaussianSigmaFromRadius(6)).toBeCloseTo(2);
    expect(computeGaussianSigmaFromRadius(9)).toBeCloseTo(3);
  });
  it('clamps negative radius to 0', () => {
    expect(computeGaussianSigmaFromRadius(-3)).toBe(0);
  });
  it('round-trips with computeGaussianRadiusFromSigma', () => {
    const radius = 8;
    const sigma = computeGaussianSigmaFromRadius(radius);
    expect(computeGaussianRadiusFromSigma(sigma)).toBe(radius);
  });
});

describe('computeSeparableBlurPassCount', () => {
  it('defaults to 1 when samples is undefined', () => {
    expect(computeSeparableBlurPassCount(undefined)).toBe(1);
  });
  it('returns at least 1', () => {
    expect(computeSeparableBlurPassCount(0)).toBe(1);
    expect(computeSeparableBlurPassCount(-5)).toBe(1);
  });
  it('rounds fractional samples', () => {
    expect(computeSeparableBlurPassCount(2.4)).toBe(2);
    expect(computeSeparableBlurPassCount(2.6)).toBe(3);
  });
  it('returns integer pass count', () => {
    expect(computeSeparableBlurPassCount(4)).toBe(4);
  });
});

describe('createGaussianKernelWeights', () => {
  it('writes radius + 1 weights and returns that count', () => {
    const out = new Float32Array(10);
    const count = createGaussianKernelWeights(4, 1.5, out);
    expect(count).toBe(5);
  });
  it('normalized weights sum to 1 (center + 2 * each side)', () => {
    const radius = 4;
    const sigma = 1.5;
    const out = new Float32Array(radius + 1);
    const count = createGaussianKernelWeights(radius, sigma, out);
    let sum = out[0];
    for (let i = 1; i < count; i++) {
      sum += 2 * out[i];
    }
    expect(sum).toBeCloseTo(1, 5);
  });
  it('center weight is the largest', () => {
    const out = new Float32Array(10);
    const count = createGaussianKernelWeights(5, 2, out);
    for (let i = 1; i < count; i++) {
      expect(out[0]).toBeGreaterThan(out[i]);
    }
  });
  it('weights decrease monotonically from center', () => {
    const out = new Float32Array(10);
    const count = createGaussianKernelWeights(5, 2, out);
    for (let i = 1; i < count; i++) {
      expect(out[i - 1]).toBeGreaterThan(out[i]);
    }
  });
});
