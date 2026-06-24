import type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ConvolutionFilter,
  DisplacementMapFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  InnerGlowFilter,
  InnerShadowFilter,
  OuterGlowFilter,
  SharpenFilter,
} from '@flighthq/types';

// Default values matching canonical Flash/OpenFL filter defaults. Exported so backends can
// reference them instead of duplicating the constants.
export const DEFAULT_FILTER_ALPHA = 1;
export const DEFAULT_FILTER_ANGLE = 45;
export const DEFAULT_FILTER_BLUR_X = 4;
export const DEFAULT_FILTER_BLUR_Y = 4;
export const DEFAULT_FILTER_COLOR = 0x000000;
export const DEFAULT_FILTER_DISTANCE = 4;
export const DEFAULT_FILTER_KNOCKOUT = false;
export const DEFAULT_FILTER_QUALITY = 1;
export const DEFAULT_FILTER_STRENGTH = 1;

/**
 * Returns a deep copy of `filter`. Array fields (matrix, colors, alphas, ratios) are copied, not
 * aliased. Allocates a new object; use `copyBitmapFilterInto` for hot reuse.
 */
export function cloneBitmapFilter<T extends BitmapFilter>(filter: Readonly<T>): T {
  return deepCopyFilter(filter) as T;
}

/**
 * Returns a list that is a deep copy of `filters`. Each filter's array fields are copied, not
 * aliased. Allocates new objects.
 */
export function cloneBitmapFilterList(filters: ReadonlyArray<BitmapFilter>): BitmapFilter[] {
  return filters.map(cloneBitmapFilter);
}

/**
 * Copies all fields from `source` into `out`. `out` must have the same `kind` as `source`. Reads
 * all inputs into locals before writing, so `out === source` is safe.
 */
export function copyBitmapFilterInto(out: BitmapFilter, source: Readonly<BitmapFilter>): void {
  if (out.kind !== source.kind) {
    throw new Error(`copyBitmapFilterInto: kind mismatch — out.kind '${out.kind}' !== source.kind '${source.kind}'`);
  }
  const copy = deepCopyFilter(source);
  Object.assign(out, copy);
}

/**
 * Returns `true` when `a` and `b` are structurally equal: same kind and same field values,
 * including deep comparison of array fields. Returns `false` on any difference, including kind
 * mismatch.
 */
export function equalsBitmapFilter(a: Readonly<BitmapFilter>, b: Readonly<BitmapFilter>): boolean {
  if (a.kind !== b.kind) return false;
  return deepEqualFilter(a, b);
}

/**
 * Returns `true` when `a` and `b` are both structurally equal filter lists: same length, same
 * kinds, and same field values for each pair in order.
 */
export function equalsBitmapFilterList(a: ReadonlyArray<BitmapFilter>, b: ReadonlyArray<BitmapFilter>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!equalsBitmapFilter(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Returns a copy of `filter` with all optional fields filled in with their canonical Flash/OpenFL
 * defaults. Backends can use this to skip individual field defaulting. The returned descriptor is
 * fully specified — no `undefined` fields — and retains any values the caller already set.
 * Idempotent: normalizing an already-normalized filter returns an equal descriptor.
 */
export function normalizeBitmapFilter(filter: Readonly<BitmapFilter>): Readonly<BitmapFilter> {
  switch (filter.kind) {
    case 'BevelFilter':
      return normalizeBevelFilter(filter as Readonly<BevelFilter>);
    case 'BlurFilter':
      return normalizeBlurFilter(filter as Readonly<BlurFilter>);
    case 'ColorMatrixFilter':
      return filter;
    case 'ConvolutionFilter':
      return normalizeConvolutionFilter(filter as Readonly<ConvolutionFilter>);
    case 'DisplacementMapFilter':
      return normalizeDisplacementMapFilter(filter as Readonly<DisplacementMapFilter>);
    case 'DropShadowFilter':
      return normalizeDropShadowFilter(filter as Readonly<DropShadowFilter>);
    case 'GradientBevelFilter':
      return normalizeGradientBevelFilter(filter as Readonly<GradientBevelFilter>);
    case 'GradientGlowFilter':
      return normalizeGradientGlowFilter(filter as Readonly<GradientGlowFilter>);
    case 'InnerGlowFilter':
      return normalizeInnerGlowFilter(filter as Readonly<InnerGlowFilter>);
    case 'InnerShadowFilter':
      return normalizeInnerShadowFilter(filter as Readonly<InnerShadowFilter>);
    case 'MedianFilter':
      return filter;
    case 'OuterGlowFilter':
      return normalizeOuterGlowFilter(filter as Readonly<OuterGlowFilter>);
    case 'PixelateFilter':
      return filter;
    case 'SharpenFilter':
      return normalizeSharpenFilter(filter as Readonly<SharpenFilter>);
    default:
      return filter;
  }
}

// --- private helpers ---

function deepCopyFilter(filter: Readonly<BitmapFilter>): BitmapFilter {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(filter)) {
    const value = (filter as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      copy[key] = value.slice();
    } else {
      copy[key] = value;
    }
  }
  return copy as unknown as BitmapFilter;
}

function arraysEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function deepEqualFilter(a: Readonly<BitmapFilter>, b: Readonly<BitmapFilter>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (!arraysEqual(av, bv)) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

function normalizeBevelFilter(f: Readonly<BevelFilter>): BevelFilter {
  return {
    kind: f.kind,
    angle: f.angle ?? DEFAULT_FILTER_ANGLE,
    bevelType: f.bevelType ?? 'inner',
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    distance: f.distance ?? DEFAULT_FILTER_DISTANCE,
    highlightAlpha: f.highlightAlpha ?? DEFAULT_FILTER_ALPHA,
    highlightColor: f.highlightColor ?? 0xffffff,
    knockout: f.knockout ?? DEFAULT_FILTER_KNOCKOUT,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    shadowAlpha: f.shadowAlpha ?? DEFAULT_FILTER_ALPHA,
    shadowColor: f.shadowColor ?? DEFAULT_FILTER_COLOR,
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeBlurFilter(f: Readonly<BlurFilter>): BlurFilter {
  return {
    kind: f.kind,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
  };
}

function normalizeConvolutionFilter(f: Readonly<ConvolutionFilter>): ConvolutionFilter {
  return {
    kind: f.kind,
    bias: f.bias ?? 0,
    clamp: f.clamp ?? true,
    color: f.color ?? 0x000000,
    divisor: f.divisor ?? 1,
    matrix: f.matrix.slice(),
    matrixX: f.matrixX,
    matrixY: f.matrixY,
    preserveAlpha: f.preserveAlpha ?? true,
  };
}

function normalizeDisplacementMapFilter(f: Readonly<DisplacementMapFilter>): DisplacementMapFilter {
  return {
    kind: f.kind,
    alpha: f.alpha ?? 0,
    color: f.color ?? 0x000000,
    componentX: f.componentX ?? 0,
    componentY: f.componentY ?? 1,
    mode: f.mode ?? 'wrap',
    scaleX: f.scaleX ?? 0,
    scaleY: f.scaleY ?? 0,
  };
}

function normalizeDropShadowFilter(f: Readonly<DropShadowFilter>): DropShadowFilter {
  return {
    kind: f.kind,
    alpha: f.alpha ?? DEFAULT_FILTER_ALPHA,
    angle: f.angle ?? DEFAULT_FILTER_ANGLE,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    color: f.color ?? DEFAULT_FILTER_COLOR,
    distance: f.distance ?? DEFAULT_FILTER_DISTANCE,
    hideObject: f.hideObject ?? false,
    knockout: f.knockout ?? DEFAULT_FILTER_KNOCKOUT,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeGradientBevelFilter(f: Readonly<GradientBevelFilter>): GradientBevelFilter {
  return {
    kind: f.kind,
    alphas: f.alphas.slice(),
    angle: f.angle ?? DEFAULT_FILTER_ANGLE,
    bevelType: f.bevelType ?? 'inner',
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    colors: f.colors.slice(),
    distance: f.distance ?? DEFAULT_FILTER_DISTANCE,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    ratios: f.ratios.slice(),
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeGradientGlowFilter(f: Readonly<GradientGlowFilter>): GradientGlowFilter {
  return {
    kind: f.kind,
    alphas: f.alphas.slice(),
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    colors: f.colors.slice(),
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    ratios: f.ratios.slice(),
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeInnerGlowFilter(f: Readonly<InnerGlowFilter>): InnerGlowFilter {
  return {
    kind: f.kind,
    alpha: f.alpha ?? DEFAULT_FILTER_ALPHA,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    color: f.color ?? DEFAULT_FILTER_COLOR,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeInnerShadowFilter(f: Readonly<InnerShadowFilter>): InnerShadowFilter {
  return {
    kind: f.kind,
    alpha: f.alpha ?? DEFAULT_FILTER_ALPHA,
    angle: f.angle ?? DEFAULT_FILTER_ANGLE,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    color: f.color ?? DEFAULT_FILTER_COLOR,
    distance: f.distance ?? DEFAULT_FILTER_DISTANCE,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeOuterGlowFilter(f: Readonly<OuterGlowFilter>): OuterGlowFilter {
  return {
    kind: f.kind,
    alpha: f.alpha ?? DEFAULT_FILTER_ALPHA,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    color: f.color ?? DEFAULT_FILTER_COLOR,
    knockout: f.knockout ?? DEFAULT_FILTER_KNOCKOUT,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
    strength: f.strength ?? DEFAULT_FILTER_STRENGTH,
  };
}

function normalizeSharpenFilter(f: Readonly<SharpenFilter>): SharpenFilter {
  return {
    kind: f.kind,
    amount: f.amount ?? 1,
    blurX: f.blurX ?? DEFAULT_FILTER_BLUR_X,
    blurY: f.blurY ?? DEFAULT_FILTER_BLUR_Y,
    quality: f.quality ?? DEFAULT_FILTER_QUALITY,
  };
}
