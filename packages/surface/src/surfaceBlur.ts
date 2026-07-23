import type { SurfaceBoxBlurOptions, SurfaceRegion } from '@flighthq/types';

import { extractSurfacePixels } from './surfaceComposite';

/**
 * Single horizontal box blur pass using a sliding-window accumulator — O(n)
 * per row regardless of radius. Reads from `source`, writes to `out`.
 * `out` must not alias `source`.
 */
export function blurSurfacePixelsHorizontal(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  radius: number,
): void {
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;
    const initEnd = Math.min(radius + 1, width);
    for (let x = 0; x < initEnd; x++) {
      const i = (rowOffset + x) * 4;
      r += source[i];
      g += source[i + 1];
      b += source[i + 2];
      a += source[i + 3];
      count++;
    }
    for (let x = 0; x < width; x++) {
      const di = (rowOffset + x) * 4;
      out[di] = Math.round(r / count);
      out[di + 1] = Math.round(g / count);
      out[di + 2] = Math.round(b / count);
      out[di + 3] = Math.round(a / count);
      const leaving = x - radius;
      if (leaving >= 0) {
        const li = (rowOffset + leaving) * 4;
        r -= source[li];
        g -= source[li + 1];
        b -= source[li + 2];
        a -= source[li + 3];
        count--;
      }
      const entering = x + radius + 1;
      if (entering < width) {
        const ei = (rowOffset + entering) * 4;
        r += source[ei];
        g += source[ei + 1];
        b += source[ei + 2];
        a += source[ei + 3];
        count++;
      }
    }
  }
}

/**
 * Single horizontal weighted blur pass. Kernel weights are applied at each
 * position; `kernel.length` must be odd (2 * radius + 1). Reads from
 * `source`, writes to `out`. `out` must not alias `source`.
 */
export function blurSurfacePixelsHorizontalWeighted(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  kernel: Readonly<Float32Array>,
): void {
  const radius = (kernel.length - 1) >> 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < kernel.length; k++) {
        const px = Math.max(0, Math.min(width - 1, x + k - radius));
        const i = (y * width + px) * 4;
        const w = kernel[k];
        r += source[i] * w;
        g += source[i + 1] * w;
        b += source[i + 2] * w;
        a += source[i + 3] * w;
      }
      const di = (y * width + x) * 4;
      out[di] = Math.round(r);
      out[di + 1] = Math.round(g);
      out[di + 2] = Math.round(b);
      out[di + 3] = Math.round(a);
    }
  }
}

/**
 * Single vertical box blur pass using a sliding-window accumulator — O(n)
 * per column regardless of radius. Reads from `source`, writes to `out`.
 * `out` must not alias `source`.
 */
export function blurSurfacePixelsVertical(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  radius: number,
): void {
  for (let x = 0; x < width; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;
    const initEnd = Math.min(radius + 1, height);
    for (let y = 0; y < initEnd; y++) {
      const i = (y * width + x) * 4;
      r += source[i];
      g += source[i + 1];
      b += source[i + 2];
      a += source[i + 3];
      count++;
    }
    for (let y = 0; y < height; y++) {
      const di = (y * width + x) * 4;
      out[di] = Math.round(r / count);
      out[di + 1] = Math.round(g / count);
      out[di + 2] = Math.round(b / count);
      out[di + 3] = Math.round(a / count);
      const leaving = y - radius;
      if (leaving >= 0) {
        const li = (leaving * width + x) * 4;
        r -= source[li];
        g -= source[li + 1];
        b -= source[li + 2];
        a -= source[li + 3];
        count--;
      }
      const entering = y + radius + 1;
      if (entering < height) {
        const ei = (entering * width + x) * 4;
        r += source[ei];
        g += source[ei + 1];
        b += source[ei + 2];
        a += source[ei + 3];
        count++;
      }
    }
  }
}

/**
 * Single vertical weighted blur pass. Kernel weights are applied at each
 * position; `kernel.length` must be odd (2 * radius + 1). Reads from
 * `source`, writes to `out`. `out` must not alias `source`.
 */
export function blurSurfacePixelsVerticalWeighted(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  kernel: Readonly<Float32Array>,
): void {
  const radius = (kernel.length - 1) >> 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < kernel.length; k++) {
        const py = Math.max(0, Math.min(height - 1, y + k - radius));
        const i = (py * width + x) * 4;
        const w = kernel[k];
        r += source[i] * w;
        g += source[i + 1] * w;
        b += source[i + 2] * w;
        a += source[i + 3] * w;
      }
      const di = (y * width + x) * 4;
      out[di] = Math.round(r);
      out[di + 1] = Math.round(g);
      out[di + 2] = Math.round(b);
      out[di + 3] = Math.round(a);
    }
  }
}

/**
 * Applies a box blur to `source` and writes the result into `out`.
 * `scratch` is a ping-pong buffer; its contents are undefined after the
 * call. Both must be at least `source.width * source.height * 4` bytes.
 *
 * `radiusX` and `radiusY` are the blur radius in pixels (default 2). `passes`
 * repeats the H+V pass pair (default 1); multiple passes approximate a Gaussian.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function boxBlurSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceBoxBlurOptions> = {},
): void {
  const radiusX = Math.max(0, Math.round(options.radiusX ?? 2));
  const radiusY = Math.max(0, Math.round(options.radiusY ?? 2));
  const passes = Math.max(1, Math.round(options.passes ?? 1));

  extractSurfacePixels(out, source);

  let a = out;
  let b = scratch;

  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      blurSurfacePixelsHorizontal(b, a, source.width, source.height, radiusX);
      const t = a;
      a = b;
      b = t;
    }
    if (radiusY > 0) {
      blurSurfacePixelsVertical(b, a, source.width, source.height, radiusY);
      const t = a;
      a = b;
      b = t;
    }
  }

  if (a !== out) {
    out.set(a.subarray(0, source.width * source.height * 4));
  }
}

/**
 * Fills `out` with a normalized 1-D Gaussian kernel of length `2 * radius + 1`.
 * `out` must be a `Float32Array` of exactly that length. Caller allocates once
 * and reuses across frames.
 */
export function computeGaussianKernel(out: Float32Array, radius: number, sigma: number): void {
  const len = 2 * radius + 1;
  // sigma <= 0 has no spread: a unit impulse at the center (an identity blur).
  // Computing exp(-x² / 0) would otherwise fill the kernel with NaN.
  if (sigma <= 0) {
    out.fill(0, 0, len);
    out[radius] = 1;
    return;
  }
  let sum = 0;
  const twoSigmaSq = 2 * sigma * sigma;
  for (let i = 0; i < len; i++) {
    const x = i - radius;
    out[i] = Math.exp(-(x * x) / twoSigmaSq);
    sum += out[i];
  }
  for (let i = 0; i < len; i++) {
    out[i] /= sum;
  }
}

/**
 * Applies a Gaussian blur to `source` and writes the result into `out`.
 * `scratch` is a ping-pong buffer; its contents are undefined after the
 * call. Both must be at least `source.width * source.height * 4` bytes.
 *
 * `sigmaX` and `sigmaY` are the standard deviation of the Gaussian (CSS
 * `blur(Xpx)` uses sigma = X). `sigmaY` defaults to `sigmaX`. `passes`
 * repeats the H+V pass pair (default 1).
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function gaussianBlurSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  sigmaX: number,
  sigmaY: number = sigmaX,
  passes: number = 1,
): void {
  const passCount = Math.max(1, Math.round(passes));

  const radiusX = Math.max(0, Math.ceil(sigmaX * 3));
  const radiusY = Math.max(0, Math.ceil(sigmaY * 3));
  const kernelX = radiusX > 0 ? new Float32Array(2 * radiusX + 1) : null;
  const kernelY = radiusY > 0 ? new Float32Array(2 * radiusY + 1) : null;
  if (kernelX) computeGaussianKernel(kernelX, radiusX, sigmaX);
  if (kernelY) computeGaussianKernel(kernelY, radiusY, sigmaY);

  extractSurfacePixels(out, source);

  let a = out;
  let b = scratch;

  for (let pass = 0; pass < passCount; pass++) {
    if (kernelX) {
      blurSurfacePixelsHorizontalWeighted(b, a, source.width, source.height, kernelX);
      const t = a;
      a = b;
      b = t;
    }
    if (kernelY) {
      blurSurfacePixelsVerticalWeighted(b, a, source.width, source.height, kernelY);
      const t = a;
      a = b;
      b = t;
    }
  }

  if (a !== out) {
    out.set(a.subarray(0, source.width * source.height * 4));
  }
}
