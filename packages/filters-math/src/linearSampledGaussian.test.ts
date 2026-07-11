import { computeGaussianKernelWeights, getGaussianKernelSize } from './gaussianKernel';
import { computeLinearSampledGaussian, getLinearSampledGaussianTapCount } from './linearSampledGaussian';

describe('computeLinearSampledGaussian', () => {
  const sumOf = (weights: ReadonlyArray<number>): number => weights.reduce((total, weight) => total + weight, 0);

  it('produces combined weights that sum to 1', () => {
    for (const sigma of [1, 2, 3.5, 6]) {
      const weights: number[] = [];
      const offsets: number[] = [];
      computeLinearSampledGaussian(sigma, weights, offsets);
      expect(sumOf(weights)).toBeCloseTo(1, 12);
    }
  });

  it('sizes both arrays to the tap count', () => {
    const weights: number[] = [];
    const offsets: number[] = [];
    computeLinearSampledGaussian(3, weights, offsets);
    const tapCount = getLinearSampledGaussianTapCount(3);
    expect(weights.length).toBe(tapCount);
    expect(offsets.length).toBe(tapCount);
  });

  it('sets each paired offset to the weighted midpoint of its two texels', () => {
    const sigma = 2;
    const discrete: number[] = [];
    computeGaussianKernelWeights(sigma, discrete);
    const radius = (getGaussianKernelSize(sigma) - 1) / 2;

    const weights: number[] = [];
    const offsets: number[] = [];
    computeLinearSampledGaussian(sigma, weights, offsets);

    for (let tap = 0; tap < weights.length; tap++) {
      const i = tap * 2;
      const posA = i - radius;
      if (i + 1 < discrete.length) {
        const weightA = discrete[i];
        const weightB = discrete[i + 1];
        expect(weights[tap]).toBeCloseTo(weightA + weightB, 12);
        const midpoint = (posA * weightA + (posA + 1) * weightB) / (weightA + weightB);
        expect(offsets[tap]).toBeCloseTo(midpoint, 12);
        // The bilinear tap samples strictly between its two source texels.
        expect(offsets[tap]).toBeGreaterThanOrEqual(posA);
        expect(offsets[tap]).toBeLessThanOrEqual(posA + 1);
      } else {
        // Odd kernel: the last texel is emitted alone at its integer offset.
        expect(weights[tap]).toBeCloseTo(discrete[i], 12);
        expect(offsets[tap]).toBe(posA);
      }
    }
  });

  it('reconstructs the discrete kernel mass at each tap', () => {
    // A bilinear read at a fractional offset returns the linear blend of the two texels weighted by
    // the tap weight; summed over the pair that equals w[i]+w[i+1] applied at those two positions.
    const sigma = 3;
    const discrete: number[] = [];
    computeGaussianKernelWeights(sigma, discrete);
    const weights: number[] = [];
    const offsets: number[] = [];
    computeLinearSampledGaussian(sigma, weights, offsets);
    expect(sumOf(weights)).toBeCloseTo(sumOf(discrete), 12);
  });

  it('returns outWeights', () => {
    const weights: number[] = [];
    const offsets: number[] = [];
    expect(computeLinearSampledGaussian(2, weights, offsets)).toBe(weights);
  });
});

describe('getLinearSampledGaussianTapCount', () => {
  it('is ceil(kernelSize / 2)', () => {
    for (const sigma of [1, 2, 3.5, 6]) {
      expect(getLinearSampledGaussianTapCount(sigma)).toBe(Math.ceil(getGaussianKernelSize(sigma) / 2));
    }
  });

  it('roughly halves the discrete tap count', () => {
    const discrete = getGaussianKernelSize(4);
    const linear = getLinearSampledGaussianTapCount(4);
    expect(linear).toBeLessThan(discrete);
    expect(linear).toBe(Math.ceil(discrete / 2));
  });
});
