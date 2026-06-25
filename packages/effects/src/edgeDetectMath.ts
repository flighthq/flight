import type { OutlineEffect, SketchEffect } from '@flighthq/types';

// Edge detection recipe math. Shared by OutlineEffect (color silhouette) and SketchEffect
// (pencil-line stylize) backends. Both use Sobel/Prewitt edge detection internally; this module
// provides the parameter derivations so all backends agree on threshold semantics.
// All functions are alias-safe and zero-allocation (scalar return or out-param).

// Compute the outline edge-detect threshold and output blend params for an OutlineEffect.
// Writes [threshold, feather, colorR, colorG, colorB, colorA] into `out` (6 values).
// threshold: Sobel gradient magnitude above which a pixel is considered an edge.
// feather: soft band above threshold for anti-aliased edges (= threshold * 0.5).
// colorR/G/B/A: unpacked RGBA from effect.color, normalized to [0..1].
// Alias-safe.
export function computeOutlineEdgeParams(
  effect: Readonly<OutlineEffect>,
  out: [number, number, number, number, number, number],
): void {
  const threshold = Math.max(0, effect.threshold ?? 0.1);
  const feather = threshold * 0.5;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  out[0] = threshold;
  out[1] = feather;
  out[2] = r;
  out[3] = g;
  out[4] = b;
  out[5] = a;
}

// Compute the outline thickness expansion in pixels. Outline backends typically dilate the edge
// mask by the thickness using a simple box dilate; this returns the integer dilation radius.
export function computeOutlineThicknessPx(effect: Readonly<OutlineEffect>): number {
  return Math.max(0, Math.round(effect.thickness ?? 1));
}

// Compute the sketch edge-detect threshold and strength for a SketchEffect.
// Writes [threshold, strength] into `out`.
// threshold: Sobel gradient magnitude for edge detection; derived from `strength` so that
//   lower strength = higher threshold (looser edge capture).
// strength: direct sketch line brightness multiplier.
// Alias-safe.
export function computeSketchEdgeParams(effect: Readonly<SketchEffect>, out: [number, number]): void {
  const strength = Math.max(0, Math.min(1, effect.strength ?? 1));
  // Threshold inversely proportional to strength; at strength=1 catch fine edges (0.05),
  // at strength=0 threshold is 1 (no edges). Clamp to [0.01..1].
  const threshold = Math.max(0.01, Math.min(1, 1 - strength * 0.95));
  out[0] = threshold;
  out[1] = strength;
}

// Compute the Sobel kernel coefficients for a 3×3 edge-detect pass.
// Returns [gx, gy] — the two 3×3 filter kernels in row-major order — as a pair of 9-element slices
// into `out` (first 9 = Gx, next 9 = Gy). `out` must have capacity >= 18.
// These are the standard Sobel operator coefficients; they are the same for every effect.
// Alias-safe: writes to a fresh output without reading from it.
export function getSobelKernelCoefficients(out: Float32Array): void {
  // Gx: horizontal edges
  out[0] = -1;
  out[1] = 0;
  out[2] = 1;
  out[3] = -2;
  out[4] = 0;
  out[5] = 2;
  out[6] = -1;
  out[7] = 0;
  out[8] = 1;
  // Gy: vertical edges
  out[9] = -1;
  out[10] = -2;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  out[16] = 2;
  out[17] = 1;
}
