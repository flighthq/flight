import type Matrix3x2 from '../math/Matrix3x2.js';
import type Rectangle from '../math/Rectangle.js';

export interface GraphState {
  appearanceID: number;
  boundsRect: Rectangle | null;
  boundsRectUsingLocalBoundsID: number;
  boundsRectUsingLocalTransformID: number;
  localBoundsRect: Rectangle | null;
  localBoundsRectUsingLocalBoundsID: number;
  localBoundsID: number;
  localTransform: Matrix3x2 | null;
  localTransformUsingLocalTransformID: number;
  localTransformID: number;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldBoundsRect: Rectangle | null;
  worldBoundsRectUsingLocalBoundsID: number;
  worldBoundsRectUsingWorldTransformID: number;
  worldTransform: Matrix3x2 | null;
  worldTransformID: number;
  worldTransformUsingParentID: number;
}

export namespace GraphState {
  export const SymbolKey: unique symbol = Symbol('GraphState');
}
