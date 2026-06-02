import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { Rectangle } from './Rectangle';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';

export interface HasBoundsRect extends Entity {}

export interface HasBoundsRectRuntime extends EntityRuntime {
  boundsRect: Rectangle | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
  computeLocalBoundsRect: (out: Rectangle, source: Readonly<GraphBoundsNode<any, any>>) => void;
  localBoundsRect: Rectangle | null;
  worldBoundsRect: Rectangle | null;
}

export type GraphBoundsNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasBoundsRect;

export type GraphSpatial2DNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasBoundsRect & HasTransform2D;
