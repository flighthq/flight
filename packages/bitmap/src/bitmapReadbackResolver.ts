import type { Bitmap, BitmapReadbackBlockReason, BitmapReadbackMode, HostImageSource } from '@flighthq/types/contract';

import { getBitmapReadbackBackend } from './bitmapReadbackBackend';

interface BitmapReadbackResolution {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBlockReason;
}

// Package-private: both public projections route through this resolver, but it is deliberately absent
// from the package barrels so callers cannot couple to the selection machinery.
export function resolveBitmapReadback(
  source: HostImageSource,
  width: number,
  height: number,
  mode: BitmapReadbackMode,
): BitmapReadbackResolution {
  if (width <= 0 || height <= 0) return { bitmap: null, reason: 'empty-size' };
  const backend = getBitmapReadbackBackend();
  if (backend === null) return { bitmap: null, reason: 'backend-not-installed' };
  return backend.readBitmap(source, width, height, mode);
}
