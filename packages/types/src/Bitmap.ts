import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { ImageResource } from './ImageResource';
import type { Rectangle } from './Rectangle';

export interface BitmapData extends DisplayObjectData {
  image: ImageResource | null;
  smoothing: boolean;
  sourceRectangle: Rectangle | null;
}

export interface BitmapRuntime extends DisplayObjectRuntime {}

export interface Bitmap extends DisplayObject {
  data: BitmapData;
}

export const BitmapKind = 'Bitmap';
