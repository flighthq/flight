/**
 * Fills `out` with the 1D discrete Gaussian kernel weights for standard deviation `sigma`,
 * normalized so the emitted weights sum to exactly 1. The kernel is symmetric with `out.length`
 * set to `getGaussianKernelSize(sigma)` (an odd length), the center entry the largest. Because the
 * kernel is truncated at radius `ceil(3 * sigma)`, the raw Gaussian samples are renormalized by
 * their own truncated sum rather than the analytic 1/(sqrt(2π)·sigma) factor, so the discrete tail
 * loss is absorbed and the taps a separable blur applies sum to 1. `sigma <= 0` yields a single
 * unit weight (`[1]`), the identity kernel. Returns `out`.
 */
export function computeGaussianKernelWeights(sigma: number, out: number[]): number[] {
  const size = getGaussianKernelSize(sigma);
  out.length = size;
  if (size === 1) {
    out[0] = 1;
    return out;
  }
  const radius = (size - 1) / 2;
  const twoSigmaSquared = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const weight = Math.exp(-(x * x) / twoSigmaSquared);
    out[i] = weight;
    sum += weight;
  }
  const inverseSum = 1 / sum;
  for (let i = 0; i < size; i++) {
    out[i] *= inverseSum;
  }
  return out;
}

/**
 * Returns the length of the discrete Gaussian kernel for standard deviation `sigma`: the odd count
 * `radius * 2 + 1` where `radius = ceil(3 * sigma)`. Three standard deviations capture ~99.7% of the
 * Gaussian mass, the conventional truncation point. `sigma <= 0` returns 1 (the identity kernel).
 */
export function getGaussianKernelSize(sigma: number): number {
  if (sigma <= 0) return 1;
  const radius = Math.ceil(3 * sigma);
  return radius * 2 + 1;
}
