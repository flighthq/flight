// Gaussian / separable-blur recipe math. Substrate-agnostic helpers shared by all backends so that
// GL, WGPU, and Canvas blur passes derive identical kernel parameters from the same effect intent.
// All functions are alias-safe: they read inputs before writing any output.

// Converts a Gaussian sigma (standard deviation in pixels) to an integer blur radius.
// The radius covers ≥3σ so at least 99.7 % of the distribution is within the kernel.
export function computeGaussianRadiusFromSigma(sigma: number): number {
  return Math.ceil(3 * Math.max(0, sigma));
}

// Converts a blur radius (half-width of the kernel, in pixels) to a Gaussian sigma.
// Inverse of computeGaussianRadiusFromSigma: sigma = radius / 3.
export function computeGaussianSigmaFromRadius(radius: number): number {
  return Math.max(0, radius) / 3;
}

// Returns the number of separable blur passes for a blur-family effect based on its `samples` field.
// When `samples` is not set, defaults to 1 pass. Higher values raise quality at linear GPU cost.
// Blur family: DirectionalBlurEffect, MotionBlurEffect, RadialBlurEffect, CameraMotionBlurEffect.
export function computeSeparableBlurPassCount(samples: number | undefined): number {
  return Math.max(1, Math.round(samples ?? 1));
}

// Writes normalized 1D Gaussian kernel weights (single-sided, centered at 0) into `out` and
// returns the number of weights written. The `out` array must have capacity >= radius + 1.
// Weights are normalized so they sum to 1 (including the mirror on the other side). The
// weight at index 0 is the center weight; index k corresponds to an offset of k pixels.
// Alias-safe: `out` may point to any typed array; no shared state is read.
export function createGaussianKernelWeights(radius: number, sigma: number, out: Float32Array): number {
  const r = Math.max(0, Math.ceil(radius));
  const s = Math.max(1e-6, sigma);
  const twoSigmaSq = 2 * s * s;
  let sum = 0;
  for (let i = 0; i <= r; i++) {
    const w = Math.exp(-(i * i) / twoSigmaSq);
    out[i] = w;
    sum += i === 0 ? w : 2 * w; // center counted once, sides counted twice.
  }
  // Normalize.
  const invSum = 1 / sum;
  for (let i = 0; i <= r; i++) {
    out[i] *= invSum;
  }
  return r + 1;
}
