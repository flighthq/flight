import type { ColorMatrixFilter, ConvolutionFilter } from '@flighthq/types';

import { isBitmapFilter } from './bitmapFilterGuards';
import { COLOR_MATRIX_LENGTH } from './colorMatrixMath';

/** Clamps `quality` to the valid Flash quality range (1–15). Does not throw. */
export function clampFilterQuality(quality: number): number {
  return Math.max(1, Math.min(15, Math.round(quality)));
}

/** Clamps `strength` to the valid Flash strength range (0–255). Does not throw. */
export function clampFilterStrength(strength: number): number {
  return Math.max(0, Math.min(255, strength));
}

/**
 * Returns `true` when `filter` is a structurally valid `BitmapFilter` — known kind, required
 * fields present, array lengths and numeric ranges sane. Unknown kinds (custom filters) return
 * `false`. Does not throw.
 */
export function isValidBitmapFilter(filter: unknown): boolean {
  if (!isBitmapFilter(filter)) return false;
  switch (filter.kind) {
    case 'BevelFilter':
      return true;
    case 'BlurFilter':
      return true;
    case 'ColorMatrixFilter': {
      const m = (filter as ColorMatrixFilter).matrix;
      return Array.isArray(m) && m.length === COLOR_MATRIX_LENGTH && m.every((v) => typeof v === 'number');
    }
    case 'ConvolutionFilter': {
      const cf = filter as ConvolutionFilter;
      return (
        Array.isArray(cf.matrix) &&
        typeof cf.matrixX === 'number' &&
        typeof cf.matrixY === 'number' &&
        cf.matrix.length === cf.matrixX * cf.matrixY
      );
    }
    case 'DisplacementMapFilter':
      return true;
    case 'DropShadowFilter':
      return true;
    case 'GradientBevelFilter': {
      const gf = filter as { alphas?: unknown; colors?: unknown; ratios?: unknown };
      return Array.isArray(gf.alphas) && Array.isArray(gf.colors) && Array.isArray(gf.ratios);
    }
    case 'GradientGlowFilter': {
      const gg = filter as { alphas?: unknown; colors?: unknown; ratios?: unknown };
      return Array.isArray(gg.alphas) && Array.isArray(gg.colors) && Array.isArray(gg.ratios);
    }
    case 'InnerGlowFilter':
      return true;
    case 'InnerShadowFilter':
      return true;
    case 'MedianFilter':
      return true;
    case 'OuterGlowFilter':
      return true;
    case 'PixelateFilter':
      return true;
    case 'SharpenFilter':
      return true;
    default:
      return false;
  }
}

/**
 * Returns `true` when `filters` is an array in which every element passes `isValidBitmapFilter`.
 * Sentinel-style: returns `false` for non-array input or any invalid element; never throws.
 */
export function isValidBitmapFilterList(filters: unknown): boolean {
  if (!Array.isArray(filters)) return false;
  for (const f of filters) {
    if (!isValidBitmapFilter(f)) return false;
  }
  return true;
}
