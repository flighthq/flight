import type { BitmapFilter } from '@flighthq/types';

/**
 * Returns the canonical list of all built-in `BitmapFilter` kind strings. Useful for tooling and
 * inspectors that need to enumerate the known filter types.
 */
export function enumerateBitmapFilterKinds(): ReadonlyArray<string> {
  return Array.from(KNOWN_BITMAP_FILTER_KINDS);
}

/**
 * Reconstructs a `BitmapFilter` from a plain data object (e.g. parsed scene JSON). Returns
 * `null` when the data does not have a recognised `kind` string or is not a plain object. Sentinel
 * return; never throws.
 */
export function fromBitmapFilterData(data: unknown): BitmapFilter | null {
  if (data === null || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const kind = record['kind'];
  if (typeof kind !== 'string' || !KNOWN_BITMAP_FILTER_KINDS.has(kind)) return null;
  // Deep copy array fields so the returned descriptor owns its data and does not alias the input.
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (Array.isArray(value)) {
      result[key] = value.slice();
    } else {
      result[key] = value;
    }
  }
  return result as unknown as BitmapFilter;
}

/**
 * Projects `filter` to a plain data object safe for serialisation (e.g. JSON.stringify). Today
 * this is structurally identical to the filter since filters carry only serialisable values, but
 * pinning this seam protects future code from accidentally serialising runtime-only fields.
 * Array fields are copied, not aliased.
 */
export function toBitmapFilterData(filter: Readonly<BitmapFilter>): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(filter)) {
    const value = (filter as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      result[key] = value.slice();
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** The set of kind strings that `fromBitmapFilterData` recognises. */
const KNOWN_BITMAP_FILTER_KINDS = new Set<string>([
  'BevelFilter',
  'BlurFilter',
  'ColorMatrixFilter',
  'ConvolutionFilter',
  'DisplacementMapFilter',
  'DropShadowFilter',
  'GradientBevelFilter',
  'GradientGlowFilter',
  'InnerGlowFilter',
  'InnerShadowFilter',
  'MedianFilter',
  'OuterGlowFilter',
  'PixelateFilter',
  'SharpenFilter',
]);
