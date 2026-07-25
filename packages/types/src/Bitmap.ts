import type { ImageResource } from './ImageResource';
import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { Rectangle } from './Rectangle';

export interface BitmapData extends Node2DData {
  image: ImageResource | null;
  smoothing: boolean;
  sourceRectangle: Rectangle | null;
}

export interface BitmapRuntime extends Node2DRuntime {}

export interface Bitmap extends Node2D {
  data: BitmapData;
}

export const BitmapKind = 'Bitmap';
