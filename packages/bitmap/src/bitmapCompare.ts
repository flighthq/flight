import type { Bitmap, BitmapMismatch } from '@flighthq/types/contract';

import { createBitmap } from './bitmap';

/** The pixel facts used by mismatch measurement; accepts both decoded bytes and mutable Bitmap storage. */
interface BitmapComparisonSource {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/**
 * Compares two bitmaps pixel by pixel. Returns `null` if they are identical,
 * or a new Bitmap showing per-channel absolute differences (with alpha set to
 * 255 wherever any channel differs). Throws if the bitmaps have different
 * dimensions — comparing incompatible bitmaps is a programmer error.
 */
export function compareBitmap(source: Readonly<Bitmap>, other: Readonly<Bitmap>): Bitmap | null {
  if (source.width !== other.width || source.height !== other.height) {
    throw new Error(
      `compareBitmap: bitmap dimensions do not match (${source.width}×${source.height} vs ${other.width}×${other.height})`,
    );
  }

  const result = createBitmap(source.width, source.height);
  let hasDiff = false;

  for (let i = 0; i < source.data.length; i += 4) {
    const dr = Math.abs(source.data[i] - other.data[i]);
    const dg = Math.abs(source.data[i + 1] - other.data[i + 1]);
    const db = Math.abs(source.data[i + 2] - other.data[i + 2]);
    const da = Math.abs(source.data[i + 3] - other.data[i + 3]);
    if (dr !== 0 || dg !== 0 || db !== 0 || da !== 0) {
      result.data[i] = dr;
      result.data[i + 1] = dg;
      result.data[i + 2] = db;
      result.data[i + 3] = 255;
      hasDiff = true;
    }
  }

  return hasDiff ? result : null;
}

/**
 * Compares two equally sized bitmaps with a per-channel tolerance and returns summary metrics rather
 * than a diff image. A pixel is "mismatched" when its largest RGBA channel difference exceeds
 * `channelTolerance` (0..255). Use a small tolerance plus a `fraction` threshold to assert that two
 * backends rendered the same scene (cross-backend differential) or that a render still matches a prior
 * one, while ignoring antialiasing noise. Throws if the bitmaps differ in size — comparing
 * incompatible bitmaps is a programmer error (mirrors compareBitmap).
 */
export function getBitmapMismatch(
  source: Readonly<BitmapComparisonSource>,
  other: Readonly<BitmapComparisonSource>,
  channelTolerance: number = 0,
): BitmapMismatch {
  if (source.width !== other.width || source.height !== other.height) {
    throw new Error(
      `getBitmapMismatch: bitmap dimensions do not match (${source.width}×${source.height} vs ${other.width}×${other.height})`,
    );
  }

  const a = source.data;
  const b = other.data;
  const totalPixels = source.width * source.height;
  let mismatchedPixels = 0;
  let maxChannelDelta = 0;

  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    const da = Math.abs(a[i + 3] - b[i + 3]);
    const pixelDelta = Math.max(dr, dg, db, da);
    if (pixelDelta > maxChannelDelta) maxChannelDelta = pixelDelta;
    if (pixelDelta > channelTolerance) mismatchedPixels++;
  }

  return {
    mismatchedPixels,
    totalPixels,
    fraction: totalPixels === 0 ? 0 : mismatchedPixels / totalPixels,
    maxChannelDelta,
  };
}
