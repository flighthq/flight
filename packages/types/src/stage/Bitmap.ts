import type BitmapData from './BitmapData';
import type DisplayObject from './DisplayObject';

export default interface Bitmap extends DisplayObject {
  data: BitmapData;
}
