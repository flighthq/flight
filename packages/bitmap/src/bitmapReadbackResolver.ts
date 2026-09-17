import type {
  Bitmap,
  BitmapReadbackBlockReason,
  BitmapReadbackMode,
  HostBitmapReadbackCapability,
  HostImageSource,
} from '@flighthq/types/contract';

interface BitmapReadbackResolution {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBlockReason;
}

export function resolveBitmapReadback(
  hostBitmapReadback: Readonly<HostBitmapReadbackCapability>,
  source: HostImageSource,
  width: number,
  height: number,
  mode: BitmapReadbackMode,
): BitmapReadbackResolution {
  if (width <= 0 || height <= 0) return { bitmap: null, reason: 'empty-size' };
  return hostBitmapReadback.readBitmap(source, width, height, mode);
}
