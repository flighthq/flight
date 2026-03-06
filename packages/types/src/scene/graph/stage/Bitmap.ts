import type { ImageSource } from '../../../assets';
import type { DisplayObject, PrimitiveData } from './DisplayObject';

export interface BitmapData extends PrimitiveData {
  image: ImageSource | null;
  smoothing: boolean;
}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}
