import type { KuwaharaEffect } from '@flighthq/types';

// Kuwahara filter recipe math. The Kuwahara filter samples four overlapping sectors around each
// pixel and picks the sector with the lowest variance as the output color, producing a smooth,
// painting-like result while preserving edges. All functions are alias-safe and zero-allocation
// (out-param or scalar return).

// Compute the Gaussian-weighted kernel for a Kuwahara sector of the given radius.
// The anisotropic Kuwahara filter weights samples within each sector by a Gaussian, which
// reduces ringing artifacts versus the original flat-weight variant. Writes (radius+1)^2
// weights into `out` in row-major order; returns the number of weights written.
// `out` must have capacity >= (radius+1)^2. Alias-safe.
export function computeKuwaharaGaussianWeights(radius: number, out: Float32Array): number {
  const r = Math.max(1, Math.floor(radius));
  const size = r + 1;
  const sigma = r / 2;
  const twoSigmaSq = 2 * sigma * sigma;
  let sum = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = x * x + y * y;
      out[y * size + x] = Math.exp(-d / twoSigmaSq);
      sum += out[y * size + x];
    }
  }
  // Normalize.
  const invSum = sum > 1e-10 ? 1 / sum : 1;
  for (let i = 0; i < size * size; i++) {
    out[i] *= invSum;
  }
  return size * size;
}

// Compute the four sector UV offsets for a Kuwahara filter at the given pixel location.
// Each sector is a square region: top-left, top-right, bottom-left, bottom-right relative to
// the center pixel. `out` receives [tlX, tlY, trX, trY, blX, blY, brX, brY] — 8 values —
// in texel offsets (not normalized UV). radius is the Kuwahara radius in pixels.
// Alias-safe: computes all scalars before writing.
export function computeKuwaharaSectorOffsets(
  radius: number,
  out: [number, number, number, number, number, number, number, number],
): void {
  const r = Math.max(1, Math.floor(radius));
  const half = r;
  // Top-left sector starts at (-r, -r).
  const v0 = -half;
  const v1 = -half;
  // Top-right sector starts at (0, -r).
  const v2 = 0;
  const v3 = -half;
  // Bottom-left sector starts at (-r, 0).
  const v4 = -half;
  const v5 = 0;
  // Bottom-right sector starts at (0, 0).
  const v6 = 0;
  const v7 = 0;
  out[0] = v0;
  out[1] = v1;
  out[2] = v2;
  out[3] = v3;
  out[4] = v4;
  out[5] = v5;
  out[6] = v6;
  out[7] = v7;
}

// Compute the number of pixels in one Kuwahara sector (sectorSize × sectorSize).
// Used by backends to allocate sample kernels.
export function computeKuwaharaSectorPixelCount(effect: Readonly<KuwaharaEffect>): number {
  const s = computeKuwaharaSectorSize(effect);
  return s * s;
}

// Compute the Kuwahara sector size in pixels from the effect radius.
// The sector is a square of (radius+1)^2 pixels per quadrant. Minimum 1.
export function computeKuwaharaSectorSize(effect: Readonly<KuwaharaEffect>): number {
  return Math.max(1, Math.floor(effect.radius ?? 3)) + 1;
}
