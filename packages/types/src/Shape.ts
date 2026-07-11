import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { ShapeCommandToken } from './ShapeCommand';

export interface ShapeData extends DisplayObjectData {
  commands: ShapeCommandToken[];
}

export interface ShapeRuntime extends DisplayObjectRuntime {}

export interface Shape extends DisplayObject {
  data: ShapeData;
}

export const ShapeKind = 'Shape';
