import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

export interface ShapeData extends DisplayObjectData {
  commands: unknown[];
}

export interface ShapeRuntime extends DisplayObjectRuntime {}

export interface Shape extends DisplayObject {
  data: ShapeData;
}

export const ShapeKind = 'Shape';
