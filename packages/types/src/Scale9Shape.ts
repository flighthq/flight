import type { RectangleLike } from './Rectangle.ts';
import type { Shape, ShapeData, ShapeRuntime } from './Shape.ts';

export interface Scale9ShapeData extends ShapeData {
  readonly scale9Grid: Readonly<RectangleLike>;
}

export interface Scale9ShapeRuntime extends ShapeRuntime {}

export interface Scale9Shape extends Shape {
  data: Scale9ShapeData;
}

export const Scale9ShapeKind = 'Scale9Shape';
