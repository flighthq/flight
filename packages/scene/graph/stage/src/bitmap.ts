import type { Bitmap, BitmapData, Rectangle } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function computeBitmapLocalBounds(out: Rectangle, source: Bitmap): void {
  const bitmapData: BitmapData = source.data as BitmapData;
  if (bitmapData.image) {
    out.width = bitmapData.image.width;
    out.height = bitmapData.image.height;
  }
}

export function createBitmap(obj?: Partial<Bitmap>): Bitmap {
  return createPrimitive<Bitmap, BitmapData>(BitmapKind, obj, createBitmapData);
}

export function createBitmapData(data?: Partial<BitmapData>): BitmapData {
  return {
    image: data?.image ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
