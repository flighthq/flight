import type Affine2D from '../math/Matrix2D.js';
import type Rectangle from '../math/Rectangle.js';
import type DirtyFlags from './DirtyFlags.js';
import type DisplayObject from './DisplayObject.js';

export interface DisplayObjectDerivedState {
  bounds: Rectangle | null;
  children: DisplayObject[] | null;
  dirtyFlags: DirtyFlags;
  localBounds: Rectangle | null;
  localBoundsID: number;
  localTransform: Affine2D | null;
  localTransformID: number;
  parentTransformID: number;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldBounds: Rectangle | null;
  worldTransform: Affine2D | null;
  worldTransformID: number;
}

export namespace DisplayObjectDerivedState {
  export const Key: unique symbol = Symbol('DerivedState');
}
