import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface ShapeData extends DisplayObjectData {
  commands: unknown[];
}

export interface Shape extends DisplayObject {
  data: ShapeData;
}

export const ShapeKind: unique symbol = Symbol('Shape');
