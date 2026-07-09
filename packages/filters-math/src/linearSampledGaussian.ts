import { computeGaussianKernelWeights, getGaussianKernelSize } from './gaussianKernel';

/**
 * Produces the bilinear-tap ("linear sampling") form of a Gaussian blur for standard deviation
 * `sigma`, writing the combined weights into `outWeights` and their signed sample offsets (in texels,
 * relative to the center) into `outOffsets`. Both arrays are truncated to
 * `getLinearSampledGaussianTapCount(sigma)`.
 *
 * A separable Gaussian of `N` discrete texels can be sampled with `ceil(N / 2)` bilinear taps: each
 * adjacent texel pair `(i, i+1)` is replaced by one sample whose weight is `w[i] + w[i+1]` taken at
 * the weighted-midpoint offset `(pos[i]·w[i] + pos[i+1]·w[i+1]) / (w[i] + w[i+1])`. Reading that
 * fractional position with hardware bilinear filtering reconstructs the pair's summed contribution
 * in a single fetch, halving the tap count. `N` is always odd, so the final texel is emitted as a
 * standalone unit-pair sample at its own integer offset. The combined weights sum to 1 because the
 * source discrete weights do. Returns `outWeights`.
 */
export function computeLinearSampledGaussian(sigma: number, outWeights: number[], outOffsets: number[]): number[] {
  const size = getGaussianKernelSize(sigma);
  const radius = (size - 1) / 2;
  computeGaussianKernelWeights(sigma, scratchWeights);
  const tapCount = getLinearSampledGaussianTapCount(sigma);
  outWeights.length = tapCount;
  outOffsets.length = tapCount;
  for (let tap = 0; tap < tapCount; tap++) {
    const i = tap * 2;
    const posA = i - radius;
    if (i + 1 < size) {
      const weightA = scratchWeights[i];
      const weightB = scratchWeights[i + 1];
      const combined = weightA + weightB;
      outWeights[tap] = combined;
      outOffsets[tap] = combined === 0 ? posA + 0.5 : (posA * weightA + (posA + 1) * weightB) / combined;
    } else {
      outWeights[tap] = scratchWeights[i];
      outOffsets[tap] = posA;
    }
  }
  return outWeights;
}

/**
 * Returns the number of bilinear taps the linear-sampling Gaussian uses for standard deviation
 * `sigma`: `ceil(N / 2)` where `N = getGaussianKernelSize(sigma)`. Callers size their weight and
 * offset arrays with this before calling `computeLinearSampledGaussian`.
 */
export function getLinearSampledGaussianTapCount(sigma: number): number {
  return Math.ceil(getGaussianKernelSize(sigma) / 2);
}

const scratchWeights: number[] = [];
