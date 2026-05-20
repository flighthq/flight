import type { Entity } from './Entity';
import type { Matrix3x2 } from './Matrix3x2';
import type { Runtime } from './Runtime';

export interface HasTransform2D extends Entity {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface HasTransform2DRuntime extends Runtime {
  localTransform2D: Matrix3x2 | null;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform2D: Matrix3x2 | null;
}
