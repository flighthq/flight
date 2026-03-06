import type { Matrix3x2, Rectangle } from '../../../geometry';

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
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export const GraphStateKey: unique symbol = Symbol('GraphState');
