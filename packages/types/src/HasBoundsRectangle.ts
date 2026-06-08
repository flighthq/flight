import type { Entity, EntityRuntime } from './Entity';
import type { HasTransform2D } from './HasTransform2D';
import type { Rectangle } from './Rectangle';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';

export interface HasBoundsRectangle extends Entity {}

export interface HasBoundsRectangleRuntime extends EntityRuntime {
  boundsRectangle: Rectangle | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
  computeLocalBoundsRectangle: (out: Rectangle, source: Readonly<SceneBoundsNode<any, any>>) => void;
  localBoundsRectangle: Rectangle | null;
  worldBoundsRectangle: Rectangle | null;
}

export type SceneBoundsNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasBoundsRectangle;

export type SceneSpatial2DNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasBoundsRectangle & HasTransform2D;
