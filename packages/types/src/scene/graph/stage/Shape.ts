import type { DisplayObject, PrimitiveData } from './DisplayObject';
import type { Graphics } from './Graphics';

export interface ShapeData extends PrimitiveData {
  graphics: Graphics;
}

export interface Shape extends DisplayObject {
  data: ShapeData;
}
