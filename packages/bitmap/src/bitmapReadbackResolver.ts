import type {
  Bitmap,
  BitmapReadbackBlockReason,
  BitmapReadbackMode,
  HostBitmapReadbackProvider,
  HostImageSource,
} from '@flighthq/types/contract';

interface BitmapReadbackResolution {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBlockReason;
}

export function resolveBitmapReadback(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  source: HostImageSource,
  width: number,
  height: number,
  mode: BitmapReadbackMode,
): BitmapReadbackResolution {
  if (width <= 0 || height <= 0) return { bitmap: null, reason: 'empty-size' };
  return hostBitmapReadback.readBitmap(source, width, height, mode);
}
