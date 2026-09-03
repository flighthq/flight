import type { Bitmap, BitmapRegion, NonEntityCreateResult } from '@flighthq/types/contract';

/**
 * Allocates a `BitmapRegion`. With no bounds it covers the whole bitmap, so
 * `createBitmapRegion(bitmap)` is the fast path for "operate on everything".
 *
 * Region functions read these fields synchronously and never retain the object,
 * so in a hot loop you can allocate one region up front and reuse it with
 * `setBitmapRegion` instead of building a literal per call.
 */
export function createBitmapRegion(
  bitmap: Bitmap,
  x: number = 0,
  y: number = 0,
  width: number = bitmap.width,
  height: number = bitmap.height,
): NonEntityCreateResult<BitmapRegion, 'descriptor'> {
  return { bitmap, x, y, width, height };
}

/**
 * Writes region fields into an existing `out` region without allocating, and
 * returns `out`. With no bounds it covers the whole bitmap. Use this to thread
 * a single reusable region through a hot loop:
 *
 *   const r = createBitmapRegion(bitmap);
 *   for (…) fillBitmapRectangle(setBitmapRegion(r, bitmap, x, y, w, h), color);
 */
export function setBitmapRegion(
  out: BitmapRegion,
  bitmap: Bitmap,
  x: number = 0,
  y: number = 0,
  width: number = bitmap.width,
  height: number = bitmap.height,
): BitmapRegion {
  out.bitmap = bitmap;
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  return out;
}
