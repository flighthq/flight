import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { ImageSource } from './ImageSource';

export interface BitmapData extends DisplayObjectData {
  image: ImageSource | null;
  smoothing: boolean;
}

export interface BitmapRuntime extends DisplayObjectRuntime {}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}

export const BitmapKind: unique symbol = Symbol('Bitmap');
