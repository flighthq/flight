import type { BitmapData } from './BitmapData';
import type { DisplayObject } from './DisplayObject';

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}
