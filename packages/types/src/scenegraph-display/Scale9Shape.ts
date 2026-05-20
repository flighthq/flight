import type { RectangleLike } from '../geometry';
import type { Shape, ShapeData } from './Shape';

export interface Scale9ShapeData extends ShapeData {
  readonly scale9Grid: Readonly<RectangleLike>;
}

export interface Scale9Shape extends Shape {
  data: Scale9ShapeData;
}

export const Scale9ShapeKind: unique symbol = Symbol('Scale9Shape');
