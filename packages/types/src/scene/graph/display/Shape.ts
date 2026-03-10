import type { DisplayObject, DisplayObjectData } from './DisplayObject';
import type { Graphics } from './Graphics';

export interface ShapeData extends DisplayObjectData {
  graphics: Graphics;
}

export interface Shape extends DisplayObject {
  data: ShapeData;
}

export const ShapeKind: unique symbol = Symbol('Shape');
