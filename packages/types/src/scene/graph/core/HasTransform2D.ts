import type { Matrix3x2 } from '../../../geometry';

export interface HasTransform2D {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface HasTransform2DRuntime {
  localTransform2D: Matrix3x2 | null;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform2D: Matrix3x2 | null;
}
