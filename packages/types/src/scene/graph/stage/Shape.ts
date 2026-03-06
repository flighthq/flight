import type { DisplayObject } from './DisplayObject';
import type { ShapeData } from './ShapeData';

export interface Shape extends DisplayObject {
  data: ShapeData;
}
