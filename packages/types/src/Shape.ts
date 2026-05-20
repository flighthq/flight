import type { DisplayObject, DisplayObjectData } from './DisplayObject';
import type { ShapeCommand } from './ShapeCommand';

export interface ShapeData extends DisplayObjectData {
  commands: ShapeCommand[];
}

export interface Shape extends DisplayObject {
  data: ShapeData;
}

export const ShapeKind: unique symbol = Symbol('Shape');
