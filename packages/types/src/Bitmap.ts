import type { DisplayObject, DisplayObjectData } from './DisplayObject';
import type { ImageSource } from './ImageSource';

export interface BitmapData extends DisplayObjectData {
  image: ImageSource | null;
  smoothing: boolean;
}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}

export const BitmapKind: unique symbol = Symbol('Bitmap');
