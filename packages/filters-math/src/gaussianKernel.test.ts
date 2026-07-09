import { computeGaussianKernelWeights, getGaussianKernelSize } from './gaussianKernel';

describe('computeGaussianKernelWeights', () => {
  const sumOf = (weights: ReadonlyArray<number>): number => weights.reduce((total, weight) => total + weight, 0);

  it('produces weights that sum to exactly 1 across several sigmas', () => {
    for (const sigma of [0.75, 1, 2, 3.5, 6]) {
      const out: number[] = [];
      computeGaussianKernelWeights(sigma, out);
      expect(sumOf(out)).toBeCloseTo(1, 12);
    }
  });

  it('produces a symmetric kernel', () => {
    const out: number[] = [];
    computeGaussianKernelWeights(2, out);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(out[out.length - 1 - i], 12);
    }
  });

  it('makes the center weight the maximum', () => {
    const out: number[] = [];
    computeGaussianKernelWeights(2.5, out);
    const center = (out.length - 1) / 2;
    for (let i = 0; i < out.length; i++) {
      expect(out[center]).toBeGreaterThanOrEqual(out[i]);
    }
  });

  it('matches the closed-form Gaussian ratio between taps', () => {
    // w[center+d] / w[center] = exp(-d^2 / (2 sigma^2)), independent of the normalization constant.
    const sigma = 2;
    const out: number[] = [];
    computeGaussianKernelWeights(sigma, out);
    const center = (out.length - 1) / 2;
    for (const d of [1, 2, 3]) {
      const expectedRatio = Math.exp(-(d * d) / (2 * sigma * sigma));
      expect(out[center + d] / out[center]).toBeCloseTo(expectedRatio, 12);
    }
  });

  it('sizes out to getGaussianKernelSize and reuses the array', () => {
    const out: number[] = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9];
    computeGaussianKernelWeights(2, out);
    expect(out.length).toBe(getGaussianKernelSize(2));
  });

  it('returns the identity kernel for non-positive sigma', () => {
    const out: number[] = [];
    computeGaussianKernelWeights(0, out);
    expect(out).toEqual([1]);
    computeGaussianKernelWeights(-3, out);
    expect(out).toEqual([1]);
  });

  it('returns out', () => {
    const out: number[] = [];
    expect(computeGaussianKernelWeights(1.5, out)).toBe(out);
  });
});

describe('getGaussianKernelSize', () => {
  it('is radius*2+1 with radius = ceil(3*sigma)', () => {
    expect(getGaussianKernelSize(1)).toBe(2 * 3 + 1);
    expect(getGaussianKernelSize(2)).toBe(2 * 6 + 1);
    expect(getGaussianKernelSize(2.5)).toBe(2 * Math.ceil(7.5) + 1);
  });

  it('is always odd', () => {
    for (const sigma of [0.5, 1, 1.7, 4, 9]) {
      expect(getGaussianKernelSize(sigma) % 2).toBe(1);
    }
  });

  it('returns 1 for non-positive sigma', () => {
    expect(getGaussianKernelSize(0)).toBe(1);
    expect(getGaussianKernelSize(-2)).toBe(1);
  });
});
