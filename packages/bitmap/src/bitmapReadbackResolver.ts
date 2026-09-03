import type {
  Bitmap,
  BitmapReadbackBlockReason,
  BitmapReadbackMode,
  HasGraphicsBitmapReadback,
  HostImageSource,
} from '@flighthq/types/contract';

interface BitmapReadbackResolution {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBlockReason;
}

export function resolveBitmapReadback(
  host: Readonly<HasGraphicsBitmapReadback>,
  source: HostImageSource,
  width: number,
  height: number,
  mode: BitmapReadbackMode,
): BitmapReadbackResolution {
  if (width <= 0 || height <= 0) return { bitmap: null, reason: 'empty-size' };
  return host.graphics.bitmapReadback.readBitmap(source, width, height, mode);
}
