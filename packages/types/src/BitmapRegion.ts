import type { Bitmap } from './Bitmap.ts';

export interface BitmapRegion {
  height: number;
  bitmap: Bitmap;
  width: number;
  x: number;
  y: number;
}
