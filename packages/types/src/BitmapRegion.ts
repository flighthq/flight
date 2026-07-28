import type { Bitmap } from './Bitmap';

export interface BitmapRegion {
  height: number;
  bitmap: Bitmap;
  width: number;
  x: number;
  y: number;
}
