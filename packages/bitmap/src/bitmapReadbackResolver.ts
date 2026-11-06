import type { Bitmap, BitmapReadbackBlockReason, BitmapReadbackMode, HostBitmapReadbackCapability } from './types.ts';

interface BitmapReadbackResolution {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBlockReason;
}

export function resolveBitmapReadback(
  hostBitmapReadback: Readonly<HostBitmapReadbackCapability>,
  source: CanvasImageSource,
  width: number,
  height: number,
  mode: BitmapReadbackMode,
): BitmapReadbackResolution {
  if (width <= 0 || height <= 0) return { bitmap: null, reason: 'empty-size' };
  return hostBitmapReadback.readBitmap(source, width, height, mode);
}
