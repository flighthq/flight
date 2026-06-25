import type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  OuterGlowFilter,
} from '@flighthq/types';

/** Returns `true` when `filter` is a `BevelFilter`. */
export function isBevelFilter(filter: BitmapFilter): filter is BevelFilter {
  return filter.kind === 'BevelFilter';
}

/**
 * Returns `true` when `x` is an object with a `.kind` that is one of the known `BitmapFilter`
 * kind strings. Does not validate field presence beyond the discriminant. Does not throw.
 */
export function isBitmapFilter(x: unknown): x is BitmapFilter {
  if (typeof x !== 'object' || x === null) return false;
  const kind = (x as Record<string, unknown>).kind;
  switch (kind) {
    case 'BevelFilter':
    case 'BlurFilter':
    case 'ColorMatrixFilter':
    case 'ConvolutionFilter':
    case 'DisplacementMapFilter':
    case 'DropShadowFilter':
    case 'GradientBevelFilter':
    case 'GradientGlowFilter':
    case 'InnerGlowFilter':
    case 'InnerShadowFilter':
    case 'MedianFilter':
    case 'OuterGlowFilter':
    case 'PixelateFilter':
    case 'SharpenFilter':
      return true;
    default:
      return false;
  }
}

/** Returns `true` when `filter` is a `BlurFilter`. */
export function isBlurFilter(filter: BitmapFilter): filter is BlurFilter {
  return filter.kind === 'BlurFilter';
}

/** Returns `true` when `filter` is a `DropShadowFilter`. */
export function isDropShadowFilter(filter: BitmapFilter): filter is DropShadowFilter {
  return filter.kind === 'DropShadowFilter';
}

/** Returns `true` when `filter` is a `GradientBevelFilter`. */
export function isGradientBevelFilter(filter: BitmapFilter): filter is GradientBevelFilter {
  return filter.kind === 'GradientBevelFilter';
}

/** Returns `true` when `filter` is a `GradientGlowFilter`. */
export function isGradientGlowFilter(filter: BitmapFilter): filter is GradientGlowFilter {
  return filter.kind === 'GradientGlowFilter';
}

/** Returns `true` when `filter` is an `OuterGlowFilter`. */
export function isOuterGlowFilter(filter: BitmapFilter): filter is OuterGlowFilter {
  return filter.kind === 'OuterGlowFilter';
}
