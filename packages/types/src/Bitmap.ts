import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { ImageSource } from './ImageSource';
import type { Rectangle } from './Rectangle';

export interface BitmapData extends DisplayObjectData {
  image: ImageSource | null;
  smoothing: boolean;
  sourceRectangle: Rectangle | null;
}

export interface BitmapRuntime extends DisplayObjectRuntime {}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}

export const BitmapKind: unique symbol = Symbol('Bitmap');
