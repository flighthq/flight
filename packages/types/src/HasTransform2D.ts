import type { Entity, EntityRuntime } from './Entity';
import type { Matrix } from './Matrix';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';

export interface HasTransform2D extends Entity {
  rotation: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface HasTransform2DRuntime extends EntityRuntime {
  localTransform2D: Matrix | null;
  rotationAngle: number;
  rotationCosine: number;
  rotationSine: number;
  worldTransform2D: Matrix | null;
}

export type GraphTransform2DNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasTransform2D;
