import type { SurfaceRegion } from '@flighthq/types';

/**
 * Applies a median filter to `source`, writing into `out`. Each output channel
 * is the median of that channel over the `(2 * radius + 1)²` neighborhood,
 * clamped at the surface edges. Median filtering removes salt-and-pepper noise
 * and despeckles while preserving edges — something a linear convolution blur
 * cannot do.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.surface.data` — each output pixel reads a neighborhood of
 * source pixels.
 */
export function applySurfaceMedianFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  radius: number,
): void {
  const r = Math.max(0, Math.round(radius));
  const w = source.width;
  const h = source.height;
  const surfaceWidth = source.surface.width;
  const surfaceHeight = source.surface.height;
  const data = source.surface.data;
  const area = (2 * r + 1) * (2 * r + 1);
  // Window scratch is reused across calls and grown as needed — a median pass
  // is allocation-free after its first use at a given radius.
  if (_windowRed === null || _windowRed.length < area) {
    _windowRed = new Uint8Array(area);
    _windowGreen = new Uint8Array(area);
    _windowBlue = new Uint8Array(area);
    _windowAlpha = new Uint8Array(area);
  }
  const rs = _windowRed;
  const gs = _windowGreen as Uint8Array;
  const bs = _windowBlue as Uint8Array;
  const as = _windowAlpha as Uint8Array;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let n = 0;
      for (let ky = -r; ky <= r; ky++) {
        const sy = Math.max(0, Math.min(surfaceHeight - 1, source.y + py + ky));
        for (let kx = -r; kx <= r; kx++) {
          const sx = Math.max(0, Math.min(surfaceWidth - 1, source.x + px + kx));
          const si = (sy * surfaceWidth + sx) * 4;
          rs[n] = data[si];
          gs[n] = data[si + 1];
          bs[n] = data[si + 2];
          as[n] = data[si + 3];
          n++;
        }
      }
      const mid = n >> 1;
      const di = (py * w + px) * 4;
      out[di] = medianOf(rs, n, mid);
      out[di + 1] = medianOf(gs, n, mid);
      out[di + 2] = medianOf(bs, n, mid);
      out[di + 3] = medianOf(as, n, mid);
    }
  }
}

// Insertion sort of the first `n` entries, then return the element at `mid`.
// `n` is small (an odd square), so insertion sort beats Array.sort's overhead
// and avoids per-pixel allocation.
function medianOf(values: Uint8Array, n: number, mid: number): number {
  for (let i = 1; i < n; i++) {
    const v = values[i];
    let j = i - 1;
    while (j >= 0 && values[j] > v) {
      values[j + 1] = values[j];
      j--;
    }
    values[j + 1] = v;
  }
  return values[mid];
}

// Per-window channel scratch, reused across calls and grown to the largest
// neighborhood seen so far.
let _windowRed: Uint8Array | null = null;
let _windowGreen: Uint8Array | null = null;
let _windowBlue: Uint8Array | null = null;
let _windowAlpha: Uint8Array | null = null;
