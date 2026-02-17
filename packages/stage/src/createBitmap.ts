import type { Bitmap } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createBitmap(obj: Partial<Bitmap> = {}): Bitmap {
  obj.data = { image: null, smoothing: true };
  obj.type = 'bitmap';
  return createDisplayObject(obj) as Bitmap;
}
