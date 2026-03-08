import type { Matrix3x2 } from '../../../geometry';
import type { SceneNodeRuntime, SceneNodeRuntimeKey } from './SceneNodeRuntime';

export interface HasTransform2D<K extends symbol> {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  [SceneNodeRuntimeKey]: Transform2DRuntime<K> | undefined;
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
