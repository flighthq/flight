import type { ImageSource } from '../../../assets';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface BitmapData extends DisplayObjectData {
  image: ImageSource | null;
  smoothing: boolean;
}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}
