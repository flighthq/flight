import type { ColorTransformLike, Surface } from '@flighthq/types';

export type ThresholdOperation = '!=' | '<' | '<=' | '==' | '>' | '>=';

let _scrollScratch: Uint8ClampedArray | null = null;

/**
 * Applies a color transform to a rectangular region of `source`, writing
 * into the same region of `out`. Safe to pass the same surface as both
 * `out` and `source` for in-place modification.
 */
export function applySurfaceColorTransform(
  out: Surface,
  source: Readonly<Surface>,
  x: number,
  y: number,
  width: number,
  height: number,
  ct: Readonly<ColorTransformLike>,
): void {
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(out.width, source.width, x + width);
  const y2 = Math.min(out.height, source.height, y + height);
  for (let py = y1; py < y2; py++) {
    for (let px = x1; px < x2; px++) {
      const si = (py * source.width + px) * 4;
      const di = (py * out.width + px) * 4;
      const r = source.data[si];
      const g = source.data[si + 1];
      const b = source.data[si + 2];
      const a = source.data[si + 3];
      out.data[di] = Math.max(0, Math.min(255, Math.round(r * ct.redMultiplier + ct.redOffset)));
      out.data[di + 1] = Math.max(0, Math.min(255, Math.round(g * ct.greenMultiplier + ct.greenOffset)));
      out.data[di + 2] = Math.max(0, Math.min(255, Math.round(b * ct.blueMultiplier + ct.blueOffset)));
      out.data[di + 3] = Math.max(0, Math.min(255, Math.round(a * ct.alphaMultiplier + ct.alphaOffset)));
    }
  }
}

/**
 * Tests each pixel in the source region and writes `color` into `out` where
 * the test passes, or optionally copies the source pixel where it fails.
 * Returns the number of pixels that passed the test.
 *
 * Safe to pass the same surface as both `out` and `source` (each pixel is
 * read before it is written).
 */
export function applySurfaceThreshold(
  out: Surface,
  dx: number,
  dy: number,
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  operation: ThresholdOperation,
  thresholdValue: number,
  color: number = 0,
  mask: number = 0xffffffff,
  copySource: boolean = false,
): number {
  const x2 = Math.min(sw, source.width - sx, out.width - dx);
  const y2 = Math.min(sh, source.height - sy, out.height - dy);
  let changed = 0;
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * out.width + (dx + px)) * 4;
      const pixel =
        (((source.data[si] << 24) | (source.data[si + 1] << 16) | (source.data[si + 2] << 8) | source.data[si + 3]) &
          mask) >>>
        0;
      const passes = compare(pixel, operation, thresholdValue >>> 0);
      if (passes) {
        const cr = (color >>> 24) & 0xff;
        const cg = (color >> 16) & 0xff;
        const cb = (color >> 8) & 0xff;
        const ca = color & 0xff;
        out.data[di] = cr;
        out.data[di + 1] = cg;
        out.data[di + 2] = cb;
        out.data[di + 3] = ca;
        changed++;
      } else if (copySource) {
        out.data[di] = source.data[si];
        out.data[di + 1] = source.data[si + 1];
        out.data[di + 2] = source.data[si + 2];
        out.data[di + 3] = source.data[si + 3];
      }
    }
  }
  return changed;
}

/**
 * Blends each channel of `source` into `out` at `(dx, dy)` using per-channel
 * multipliers in the range [0, 256]: 0 keeps `out`, 256 replaces with
 * `source`, intermediate values blend proportionally.
 *
 * `out` and `source` must not be the same surface when the source and
 * destination regions overlap — the blend formula reads both surfaces, so
 * a write to `out` corrupts later reads from `source` at different positions.
 * Passing the same surface is safe only when dx=sx and dy=sy (identical
 * regions), in which case the result equals `out` for every multiplier.
 */
export function mergeSurface(
  out: Surface,
  dx: number,
  dy: number,
  source: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  redMultiplier: number,
  greenMultiplier: number,
  blueMultiplier: number,
  alphaMultiplier: number,
): void {
  const x2 = Math.min(sw, source.width - sx, out.width - dx);
  const y2 = Math.min(sh, source.height - sy, out.height - dy);
  for (let py = 0; py < y2; py++) {
    for (let px = 0; px < x2; px++) {
      const si = ((sy + py) * source.width + (sx + px)) * 4;
      const di = ((dy + py) * out.width + (dx + px)) * 4;
      out.data[di] = Math.round((source.data[si] * redMultiplier + out.data[di] * (256 - redMultiplier)) / 256);
      out.data[di + 1] = Math.round(
        (source.data[si + 1] * greenMultiplier + out.data[di + 1] * (256 - greenMultiplier)) / 256,
      );
      out.data[di + 2] = Math.round(
        (source.data[si + 2] * blueMultiplier + out.data[di + 2] * (256 - blueMultiplier)) / 256,
      );
      out.data[di + 3] = Math.round(
        (source.data[si + 3] * alphaMultiplier + out.data[di + 3] * (256 - alphaMultiplier)) / 256,
      );
    }
  }
}

/**
 * Scrolls the content of `out` by `(dx, dy)`, wrapping at the edges.
 * Uses a module-level scratch buffer that grows as needed and is reused
 * across calls.
 */
export function scrollSurface(out: Surface, dx: number, dy: number): void {
  const needed = out.data.length;
  if (_scrollScratch === null || _scrollScratch.length < needed) {
    _scrollScratch = new Uint8ClampedArray(needed);
  }
  _scrollScratch.set(out.data, 0);

  out.data.fill(0);
  for (let py = 0; py < out.height; py++) {
    const srcY = (((py - dy) % out.height) + out.height) % out.height;
    for (let px = 0; px < out.width; px++) {
      const srcX = (((px - dx) % out.width) + out.width) % out.width;
      const si = (srcY * out.width + srcX) * 4;
      const di = (py * out.width + px) * 4;
      out.data[di] = _scrollScratch[si];
      out.data[di + 1] = _scrollScratch[si + 1];
      out.data[di + 2] = _scrollScratch[si + 2];
      out.data[di + 3] = _scrollScratch[si + 3];
    }
  }
}

function compare(a: number, op: ThresholdOperation, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}
