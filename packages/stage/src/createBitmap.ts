import type { Bitmap, BitmapData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createBitmap(obj: Partial<Bitmap> = {}): Bitmap {
  if (obj.data === undefined) obj.data = {} as BitmapData;
  if (obj.data.image === undefined) obj.data.image = null;
  if (obj.data.smoothing === undefined) obj.data.smoothing = true;
  if (obj.type === undefined) obj.type = 'bitmap';
  return createDisplayObject(obj) as Bitmap;
}
