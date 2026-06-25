import { createSurface } from '@flighthq/surface';
import type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  InnerGlowFilter,
  InnerShadowFilter,
  MedianFilter,
  OuterGlowFilter,
  PixelateFilter,
  SharpenFilter,
  SurfaceRegion,
} from '@flighthq/types';

import { applyBevelFilterToSurface } from './surfaceBevelFilter';
import { applyBlurFilterToSurface } from './surfaceBlurFilter';
import { applyColorMatrixFilterToSurface } from './surfaceColorMatrixFilter';
import { applyConvolutionFilterToSurface } from './surfaceConvolutionFilter';
import { applyDropShadowFilterToSurface } from './surfaceDropShadowFilter';
import { applyGradientBevelFilterToSurface } from './surfaceGradientBevelFilter';
import { applyGradientGlowFilterToSurface } from './surfaceGradientGlowFilter';
import { applyInnerGlowFilterToSurface } from './surfaceInnerGlowFilter';
import { applyInnerShadowFilterToSurface } from './surfaceInnerShadowFilter';
import { applyMedianFilterToSurface } from './surfaceMedianFilter';
import { applyOuterGlowFilterToSurface } from './surfaceOuterGlowFilter';
import { applyPixelateFilterToSurface } from './surfacePixelateFilter';
import { applySharpenFilterToSurface } from './surfaceSharpenFilter';

/**
 * Applies an ordered list of bitmap filters to `source`, writing the final
 * result into `out`. Filters are applied in array order; each filter takes the
 * output of the previous as its source.
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes.
 * Use `acquireFilterSurfaceScratch`/`releaseFilterSurfaceScratch` to avoid
 * per-call allocation. For a zero-filter list, `out` is filled with the source
 * pixels unchanged.
 *
 * **DisplacementMapFilter is not dispatched by this function.** It requires a
 * separate `map` surface that cannot be embedded in the descriptor. Entries of
 * that kind are silently passed through (source copied to output unchanged).
 * Call `applyDisplacementMapFilterToSurface` directly when a displacement pass
 * is needed.
 *
 * `out` must not alias `source.surface.data` when any filter in the list
 * forbids aliasing (convolution, bevel, inner glow/shadow, etc.).
 */
export function applyFilterListToSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filters: ReadonlyArray<Readonly<BitmapFilter>>,
): void {
  const w = source.width;
  const h = source.height;
  if (filters.length === 0) {
    copySurfaceToBuffer(out, source);
    return;
  }
  // Two internal surfaces serve as ping-pong targets. We use createSurface to
  // produce properly shaped Surface objects, then copy data into surfA to start.
  // The `scratch` parameter provides extra scratch space for blur passes but does
  // not serve as the ping-pong surface itself (its layout does not satisfy Surface).
  const surfA = createSurface(w, h);
  const surfB = createSurface(w, h);
  const regionA: SurfaceRegion = { height: h, surface: surfA, width: w, x: 0, y: 0 };
  const regionB: SurfaceRegion = { height: h, surface: surfB, width: w, x: 0, y: 0 };
  // Seed surfA with the source pixels.
  copySurfaceToBuffer(surfA.data, source);
  // Current source for the next pass.
  let currentSrc = regionA;
  // Track which surface received the last write.
  let lastSurf = surfA;
  for (let i = 0; i < filters.length; i++) {
    const isEven = i % 2 === 0;
    // Odd passes write into surfB (reading from surfA that was seeded above or
    // written by the previous even pass), even passes write into surfA.
    const dstSurf = isEven ? surfB : surfA;
    const dstRegion = isEven ? regionB : regionA;
    const dstBuf = dstSurf.data;
    applyOneFilter(dstBuf, scratch, currentSrc, filters[i]);
    currentSrc = dstRegion;
    lastSurf = dstSurf;
  }
  // Copy the last surface's pixels into `out`.
  out.set(lastSurf.data.subarray(0, w * h * 4));
}

// Dispatches a single filter; DisplacementMapFilter is passed through (source copied).
function applyOneFilter(
  dst: Uint8ClampedArray,
  blurBuf: Uint8ClampedArray,
  src: Readonly<SurfaceRegion>,
  filter: Readonly<BitmapFilter>,
): void {
  switch (filter.kind) {
    case 'BevelFilter':
      applyBevelFilterToSurface(dst, blurBuf, src, filter as BevelFilter);
      break;
    case 'BlurFilter':
      applyBlurFilterToSurface(dst, blurBuf, src, filter as BlurFilter);
      break;
    case 'ColorMatrixFilter':
      applyColorMatrixFilterToSurface(dst, src, filter as ColorMatrixFilter);
      break;
    case 'ConvolutionFilter':
      applyConvolutionFilterToSurface(dst, src, filter as ConvolutionFilter);
      break;
    case 'DropShadowFilter':
      applyDropShadowFilterToSurface(dst, blurBuf, src, filter as DropShadowFilter);
      break;
    case 'GradientBevelFilter':
      applyGradientBevelFilterToSurface(dst, blurBuf, src, filter as GradientBevelFilter);
      break;
    case 'GradientGlowFilter':
      applyGradientGlowFilterToSurface(dst, blurBuf, src, filter as GradientGlowFilter);
      break;
    case 'InnerGlowFilter':
      applyInnerGlowFilterToSurface(dst, blurBuf, src, filter as InnerGlowFilter);
      break;
    case 'InnerShadowFilter':
      applyInnerShadowFilterToSurface(dst, blurBuf, src, filter as InnerShadowFilter);
      break;
    case 'MedianFilter':
      applyMedianFilterToSurface(dst, src, filter as MedianFilter);
      break;
    case 'OuterGlowFilter':
      applyOuterGlowFilterToSurface(dst, blurBuf, src, filter as OuterGlowFilter);
      break;
    case 'PixelateFilter':
      applyPixelateFilterToSurface(dst, src, filter as PixelateFilter);
      break;
    case 'SharpenFilter':
      applySharpenFilterToSurface(dst, blurBuf, src, filter as SharpenFilter);
      break;
    default:
      // Unsupported kind (DisplacementMapFilter, unknown) — copy source through.
      copySurfaceToBuffer(dst, src);
      break;
  }
}

// Copies a SurfaceRegion into a tightly packed row-major RGBA buffer.
function copySurfaceToBuffer(out: Uint8ClampedArray, src: Readonly<SurfaceRegion>): void {
  const w = src.width;
  const h = src.height;
  for (let py = 0; py < h; py++) {
    const sy = src.y + py;
    if (sy < 0 || sy >= src.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = src.x + px;
      if (sx < 0 || sx >= src.surface.width) continue;
      const si = (sy * src.surface.width + sx) * 4;
      const di = (py * w + px) * 4;
      out[di] = src.surface.data[si];
      out[di + 1] = src.surface.data[si + 1];
      out[di + 2] = src.surface.data[si + 2];
      out[di + 3] = src.surface.data[si + 3];
    }
  }
}
