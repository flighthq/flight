import type { Matrix3x2 } from '../../../geometry';
import type { GraphNodeRuntime } from './GraphNodeRuntime';
import type { NodeRuntimeKey } from './NodeRuntime';

export interface HasTransform2D<G extends symbol> {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  [NodeRuntimeKey]: HasTransform2DRuntime<G> | undefined;
}

export interface HasTransform2DRuntime<G extends symbol> extends GraphNodeRuntime<G> {
  localTransform2D: Matrix3x2 | null;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform2D: Matrix3x2 | null;
}
