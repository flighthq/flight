import type { Matrix3x2 } from '../../../geometry';
import type { SceneNodeRuntime } from './SceneNodeRuntime';

export interface Transform2D {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface Transform2DRuntime<K extends symbol> extends SceneNodeRuntime<K> {
  localTransform: Matrix3x2 | null;
  localTransformUsingLocalTransformID: number;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform: Matrix3x2 | null;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}
