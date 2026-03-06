import type { Bitmap, BitmapData } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

export function createBitmap(obj?: Partial<Bitmap>): Bitmap {
  return createPrimitive<Bitmap, BitmapData>(BitmapKind, obj, createBitmapData);
}

export function createBitmapData(data?: Partial<BitmapData>): BitmapData {
  return {
    image: data?.image ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
